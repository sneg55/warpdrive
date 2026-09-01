import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { PROSPECT_SEARCH_PER_PAGE } from "@/constants/prospectSearch";
import type { Db } from "@/db/client";
import type { Organization } from "@/db/schema";
import type { ContactActor } from "@/features/contacts/personsRepo";
import { can } from "@/features/permissions/can";
import { canSee } from "@/features/permissions/canSee";
import { err, ok, type Result } from "@/types/result";
import { loadOrg } from "./current";
import { normaliseDomain } from "./domain";
import { PROVIDER_DEADLINE_MS } from "./fanOut";
import { badgeProfiles, type ProspectBadge } from "./prospectDedup";
import { providerFor } from "./providers/registry";
import type {
  EnrichmentProvider,
  OutcomeKind,
  PeopleSearchInput,
  PeopleSearchOutcome,
  ProspectProfile,
  ProviderId,
  ProviderOutcome,
} from "./providers/types";
import { listUsableProviders, recordOutcome } from "./providersRepo";
import { searchCapableProviders } from "./searchProviders";

const BOOKKEEPING_TIMEOUT_MS = 5_000;

export interface ProspectSearchView {
  profiles: (ProspectProfile & { match: ProspectBadge["match"] })[];
  hasMore: boolean;
  outcome: ProviderOutcome;
}

export interface ProspectSearchInput {
  orgId: string;
  provider: ProviderId;
  titles: string[];
  seniorities: string[];
  page: number;
}

export interface ProspectSearchSeams {
  resolveProvider?: (id: ProviderId) => EnrichmentProvider;
  deadlineMs?: number;
}

function authorise(actor: ContactActor, org: Organization | null): Result<Organization, AppError> {
  if (org === null) {
    return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "not found", {}));
  }
  const record = {
    kind: "organization" as const,
    ownerId: org.ownerId,
    visibilityLevel: org.visibilityLevel,
    visibilityGroupId: org.visibilityGroupId,
    visibleToUserIds: org.visibleToUserIds,
  };
  if (!canSee(actor, record)) {
    return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "not found", {}));
  }
  if (!can(actor, "contact.create")) {
    return err(new AppError(ERROR_IDS.PERM_DENIED, "contact.create required", {}));
  }
  return ok(org);
}

function plainOutcome(outcome: ProviderOutcome): ProviderOutcome {
  return {
    provider: outcome.provider,
    kind: outcome.kind,
    message: outcome.message,
    retryAfterIso: outcome.retryAfterIso,
    quotaRemaining: outcome.quotaRemaining,
  };
}

function aborted(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason as Error);
      return;
    }
    signal.addEventListener("abort", () => reject(signal.reason as Error), { once: true });
  });
}

function failureOf(reason: unknown): { kind: OutcomeKind; message: string } {
  const name = reason instanceof Error ? reason.name : "";
  if (name === "AbortError" || name === "TimeoutError") {
    return { kind: "timeout", message: "Timed out" };
  }
  return { kind: "provider_error", message: "Unavailable" };
}

async function callSearch(
  provider: EnrichmentProvider,
  apiKey: string,
  input: PeopleSearchInput,
  signal: AbortSignal,
  deadlineMs: number,
): Promise<PeopleSearchOutcome> {
  if (provider.searchPeople === undefined) {
    return { provider: provider.id, kind: "unsupported", profiles: [], hasMore: false };
  }
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(deadlineMs)]);
  try {
    const outcome = await Promise.race([
      provider.searchPeople(input, apiKey, deadline),
      aborted(deadline),
    ]);
    return { ...outcome, provider: provider.id };
  } catch (reason) {
    signal.throwIfAborted();
    return { provider: provider.id, ...failureOf(reason), profiles: [], hasMore: false };
  }
}

export async function searchProspects(
  db: Db,
  actor: ContactActor,
  input: ProspectSearchInput,
  now: Date,
  signal: AbortSignal,
  seams: ProspectSearchSeams = {},
): Promise<Result<ProspectSearchView, AppError>> {
  signal.throwIfAborted();
  const resolveProvider = seams.resolveProvider ?? providerFor;

  const authorised = authorise(actor, await loadOrg(db, input.orgId, signal));
  if (!authorised.ok) return authorised;
  const org = authorised.value;

  const companyDomain = normaliseDomain(org.domain ?? "");
  if (companyDomain.length === 0) {
    return err(
      new AppError(ERROR_IDS.ENRICH_ORG_NO_DOMAIN, "organization has no domain", {
        orgId: input.orgId,
      }),
    );
  }

  const usable = await listUsableProviders(db, now, signal);
  signal.throwIfAborted();
  if (!searchCapableProviders(usable, resolveProvider).includes(input.provider)) {
    return err(
      new AppError(ERROR_IDS.ENRICH_NO_SEARCH_PROVIDER, "provider cannot search people", {
        provider: input.provider,
      }),
    );
  }
  const entry = usable.find((u) => u.provider === input.provider);
  if (entry === undefined) {
    return err(
      new AppError(ERROR_IDS.ENRICH_NO_SEARCH_PROVIDER, "provider is not usable", {
        provider: input.provider,
      }),
    );
  }

  const searched = await callSearch(
    resolveProvider(input.provider),
    entry.apiKey,
    {
      companyDomain,
      companyName: org.name,
      titles: input.titles,
      seniorities: input.seniorities,
      page: input.page,
      perPage: PROSPECT_SEARCH_PER_PAGE,
    },
    signal,
    seams.deadlineMs ?? PROVIDER_DEADLINE_MS,
  );

  await recordOutcome(
    db,
    searched,
    entry.credential,
    now,
    AbortSignal.timeout(BOOKKEEPING_TIMEOUT_MS),
  );

  const badges = await badgeProfiles(db, actor, input.orgId, searched.profiles, signal);
  return ok({
    profiles: searched.profiles.map((profile, index) => ({
      ...profile,
      match: badges[index]?.match ?? { kind: "new" as const },
    })),
    hasMore: searched.hasMore,
    outcome: plainOutcome(searched),
  });
}
