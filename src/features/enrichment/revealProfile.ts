import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { Organization } from "@/db/schema";
import type { NewProspectReveal, ProspectRevealRow } from "@/db/schema/prospects";
import { PERSON_LINKEDIN_KEY } from "./canonicalKeys";
import { fanOut } from "./fanOut";
import { buildPersonLookup } from "./lookup";
import { emptyBase, type ProspectMergeBase, proposeFields } from "./prospectMerge";
import { acquireRevealLock, getReservedReveal, insertReveals } from "./prospectsRepo";
import type { PersonLookup, ProspectProfile, ProviderOutcome } from "./providers/types";
import { recordOutcome } from "./providersRepo";
import { identifiableProviders } from "./revealIdentifiable";
import type { RevealContext, RevealedProspect } from "./revealTypes";

const BOOKKEEPING_TIMEOUT_MS = 5_000;

function lookupFor(org: Organization, profile: ProspectProfile): PersonLookup {
  const base = buildPersonLookup({
    name: profile.fullName,
    primaryEmail: null,
    mappedValues: { [PERSON_LINKEDIN_KEY]: profile.linkedinUrl ?? null },
    org: { name: org.name, domain: org.domain },
  });
  const given: PersonLookup = {};
  if (profile.firstName !== undefined) given.firstName = profile.firstName;
  if (profile.lastName !== undefined) given.lastName = profile.lastName;
  return { ...base, ...given };
}

function normalise(outcome: ProviderOutcome): ProviderOutcome {
  const out: ProviderOutcome = { provider: outcome.provider, kind: outcome.kind };
  if (outcome.message !== undefined) out.message = outcome.message;
  if (outcome.retryAfterIso !== undefined) out.retryAfterIso = outcome.retryAfterIso;
  if (outcome.quotaRemaining !== undefined) out.quotaRemaining = outcome.quotaRemaining;
  if (outcome.candidate !== undefined) {
    const candidate = { fields: { ...outcome.candidate.fields } };
    out.candidate =
      outcome.candidate.sourceId === undefined
        ? candidate
        : { ...candidate, sourceId: outcome.candidate.sourceId };
  }
  return out;
}

export function baseFor(
  bases: ReadonlyMap<string, ProspectMergeBase>,
  providerRef: string,
): ProspectMergeBase {
  return bases.get(providerRef) ?? emptyBase();
}

export function revealedFrom(
  row: { providerRef: string; profile: ProspectProfile; outcomes: ProviderOutcome[] },
  base: ProspectMergeBase,
  mappings: RevealContext["mappings"],
): RevealedProspect {
  return {
    providerRef: row.providerRef,
    profile: row.profile,
    outcomes: row.outcomes,
    fields: proposeFields(base, row.outcomes, mappings),
    match: base.match,
  };
}

function ownedByRequester(row: ProspectRevealRow, ctx: RevealContext): boolean {
  return row.orgId === ctx.input.orgId && row.requestedBy === ctx.actor.id;
}

export async function revealOne(
  db: Db,
  ctx: RevealContext,
  profile: ProspectProfile,
  now: Date,
  signal: AbortSignal,
): Promise<RevealedProspect> {
  return await db.transaction(async (tx) => {
    await acquireRevealLock(tx, ctx.input.batchId, profile.providerRef, signal);

    const reserved = await getReservedReveal(tx, ctx.input.batchId, profile.providerRef, signal);
    if (reserved !== null) {
      if (!ownedByRequester(reserved, ctx)) {
        throw new AppError(
          ERROR_IDS.ENRICH_BATCH_NOT_FOUND,
          "this provider ref is already reserved by another requester or organization",
          { providerRef: profile.providerRef },
        );
      }
      return revealedFrom(reserved, baseFor(ctx.bases, profile.providerRef), ctx.mappings);
    }

    const askable = identifiableProviders(ctx.usable, ctx.input.searchProvider, profile.fullName);
    if (askable.length === 0) {
      throw new AppError(
        ERROR_IDS.ENRICH_NO_PROVIDER,
        "the provider that found this masked profile is no longer usable",
        { providerRef: profile.providerRef, provider: ctx.input.searchProvider },
      );
    }

    const base = lookupFor(ctx.org, profile);
    const called = await fanOut({
      usable: askable,
      providerFor: ctx.resolveProvider,
      call: (provider, apiKey, sig) =>
        provider.matchPerson(
          provider.id === ctx.input.searchProvider
            ? { ...base, providerRef: profile.providerRef }
            : base,
          apiKey,
          sig,
        ),
      signal,
    });
    const outcomes = called.map(normalise);

    const bookkeeping = AbortSignal.timeout(BOOKKEEPING_TIMEOUT_MS);
    const credentials = new Map(ctx.usable.map((u) => [u.provider, u.credential]));
    for (const outcome of outcomes) {
      const credential = credentials.get(outcome.provider);
      if (credential === undefined) continue;
      await recordOutcome(tx, outcome, credential, now, bookkeeping);
    }

    const row: NewProspectReveal = {
      batchId: ctx.input.batchId,
      orgId: ctx.input.orgId,
      requestedBy: ctx.actor.id,
      providerRef: profile.providerRef,
      searchProvider: ctx.input.searchProvider,
      profile,
      outcomes,
    };
    await insertReveals(tx, [row], bookkeeping);

    return revealedFrom(
      { providerRef: profile.providerRef, profile, outcomes },
      baseFor(ctx.bases, profile.providerRef),
      ctx.mappings,
    );
  });
}
