import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { Organization, Person } from "@/db/schema";
import type { ContactActor } from "@/features/contacts/personsRepo";
import { can } from "@/features/permissions/can";
import { canSee } from "@/features/permissions/canSee";
import type { VisiblePersonOrOrg } from "@/features/permissions/types";
import { err, ok, type Result } from "@/types/result";
import type { EnrichEntity } from "./canonical";
import {
  type CurrentValues,
  loadOrg,
  loadPerson,
  readOrgCurrent,
  readPersonCurrent,
} from "./current";
import { fanOut, summariseOutcomes } from "./fanOut";
import {
  buildOrgLookup,
  buildPersonLookup,
  hasUsableIdentifier,
  lookupFingerprint,
} from "./lookup";
import { mappingsFingerprint } from "./mappingsFingerprint";
import { getCacheTtlDays, listMappings } from "./mappingsRepo";
import { mergeCandidates } from "./merge";
import { visibleOrgSummary } from "./orgLink";
import {
  cachedNoAnswerError,
  noAnswerError,
  noUsableProviderError,
  skippedOutcomes,
} from "./outcomeClassification";
import { providerFor } from "./providers/registry";
import type { EnrichmentProvider, ProviderId, ProviderOutcome } from "./providers/types";
import { listProviders, listUsableProviders, recordOutcome } from "./providersRepo";
import { findCachedRun, insertRun } from "./runsRepo";
import type { ProposedField, ResolvedMapping } from "./types";

const BOOKKEEPING_TIMEOUT_MS = 5_000;

export interface RunView {
  runId: string;
  entityType: EnrichEntity;
  entityId: string;
  entityUpdatedAtIso: string;
  cached: boolean;
  createdAtIso: string;
  mappingsFingerprint: string;
  fields: ProposedField[];
  outcomes: ProviderOutcome[];
}

type Subject = Organization | Person;

function toVisible(kind: "person" | "organization", subject: Subject): VisiblePersonOrOrg {
  return {
    kind,
    ownerId: subject.ownerId,
    visibilityLevel: subject.visibilityLevel,
    visibilityGroupId: subject.visibilityGroupId,
    visibleToUserIds: subject.visibleToUserIds,
  };
}

function authorise(
  actor: ContactActor,
  kind: "person" | "organization",
  subject: Subject | null,
): Result<Subject, AppError> {
  if (subject === null) {
    return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "not found", {}));
  }
  const record = toVisible(kind, subject);
  if (!canSee(actor, record)) {
    return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "not found", {}));
  }
  if (!can(actor, "contact.edit", record)) {
    return err(new AppError(ERROR_IDS.PERM_DENIED, "contact.edit required", {}));
  }
  return ok(subject);
}

export async function runEnrichment(
  db: Db,
  actor: ContactActor,
  input: { entityType: EnrichEntity; entityId: string; refresh?: boolean },
  now: Date,
  signal: AbortSignal,
  resolveProvider: (id: ProviderId) => EnrichmentProvider = providerFor,
): Promise<Result<RunView, AppError>> {
  signal.throwIfAborted();

  const person =
    input.entityType === "person" ? await loadPerson(db, input.entityId, signal) : null;
  const org =
    input.entityType === "organization" ? await loadOrg(db, input.entityId, signal) : null;
  const authorised = authorise(actor, input.entityType, person ?? org);
  if (!authorised.ok) return authorised;
  const subject = authorised.value;

  const mappings = await listMappings(db, input.entityType, signal);
  const mappingsHash = mappingsFingerprint(mappings);
  const linkedOrg =
    person === null ? null : await visibleOrgSummary(db, actor, person.orgId, signal);
  const current = await readCurrent(db, { person, org }, mappings, linkedOrg, signal);

  const view = (
    runId: string,
    createdAt: Date,
    outcomes: ProviderOutcome[],
    cached: boolean,
  ): RunView => ({
    runId,
    entityType: input.entityType,
    entityId: input.entityId,
    entityUpdatedAtIso: subject.updatedAt.toISOString(),
    cached,
    createdAtIso: createdAt.toISOString(),
    mappingsFingerprint: mappingsHash,
    fields: mergeCandidates(
      outcomes,
      current.canonicalValues,
      mappings,
      current.multiValues,
      current.occupiedKeys,
    ),
    outcomes,
  });

  const lookup =
    person !== null
      ? buildPersonLookup({
          name: person.name,
          primaryEmail: person.primaryEmail,
          mappedValues: current.canonicalValues,
          org: linkedOrg,
        })
      : buildOrgLookup({
          name: org?.name ?? "",
          domain: org?.domain ?? null,
          linkedinUrl: org?.linkedinUrl ?? null,
          mappedValues: current.canonicalValues,
        });

  if (!hasUsableIdentifier(lookup)) {
    return err(
      new AppError(ERROR_IDS.ENRICH_NO_IDENTIFIER, "no usable identifier", {
        entityType: input.entityType,
      }),
    );
  }

  const fingerprint = lookupFingerprint(lookup);

  const replay = (run: {
    id: string;
    createdAt: Date;
    outcomes: ProviderOutcome[];
  }): Result<RunView, AppError> => {
    const summary = summariseOutcomes(run.outcomes);
    if (!summary.anySucceeded) return err(cachedNoAnswerError(summary, now));
    return ok(view(run.id, run.createdAt, run.outcomes, true));
  };

  const cached =
    input.refresh === true ? null : await cachedRunFor(db, input, fingerprint, now, signal);
  if (cached !== null) return replay(cached);

  const configured = (await listProviders(db, signal)).filter((p) => p.enabled && p.hasKey);
  const usable = await listUsableProviders(db, now, signal);
  if (usable.length === 0) {
    return err(noUsableProviderError(configured, now));
  }
  const skipped = skippedOutcomes(configured, usable, now);

  const raced =
    input.refresh === true ? null : await cachedRunFor(db, input, fingerprint, now, signal);
  if (raced !== null) return replay(raced);

  const called = await fanOut({
    usable,
    providerFor: resolveProvider,
    call: (provider, apiKey, sig) =>
      person !== null
        ? provider.matchPerson(lookup, apiKey, sig)
        : provider.matchOrganization(lookup, apiKey, sig),
    signal,
  });
  const outcomes = [...called, ...skipped];

  const bookkeeping = AbortSignal.timeout(BOOKKEEPING_TIMEOUT_MS);
  const credentials = new Map(usable.map((u) => [u.provider, u.credential]));
  for (const outcome of called) {
    const credential = credentials.get(outcome.provider);
    if (credential === undefined) continue;
    await recordOutcome(db, outcome, credential, now, bookkeeping);
  }

  const run = await insertRun(
    db,
    {
      entityType: input.entityType,
      entityId: input.entityId,
      requestedBy: actor.id,
      outcomes,
      lookupFingerprint: fingerprint,
    },
    bookkeeping,
  );

  const summary = summariseOutcomes(outcomes);
  if (!summary.anySucceeded) return err(noAnswerError(summary));
  return ok(view(run.id, run.createdAt, outcomes, false));
}

async function readCurrent(
  db: Db,
  subject: { person: Person | null; org: Organization | null },
  mappings: ResolvedMapping[],
  linkedOrg: { name: string; domain: string | null } | null,
  signal: AbortSignal,
): Promise<CurrentValues> {
  if (subject.person !== null) {
    return readPersonCurrent(db, subject.person, mappings, signal, linkedOrg);
  }
  if (subject.org !== null) return readOrgCurrent(db, subject.org, mappings, signal);
  return {
    canonicalValues: {},
    multiValues: {},
    occupiedKeys: [],
    customFieldKeyById: new Map<string, string>(),
  };
}

async function cachedRunFor(
  db: Db,
  input: { entityType: EnrichEntity; entityId: string },
  fingerprint: string,
  now: Date,
  signal: AbortSignal,
) {
  return findCachedRun(
    db,
    input.entityType,
    input.entityId,
    fingerprint,
    await getCacheTtlDays(db, signal),
    now,
    signal,
  );
}
