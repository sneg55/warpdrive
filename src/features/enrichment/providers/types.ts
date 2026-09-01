export const ENRICHMENT_PROVIDER_IDS = ["apollo", "rocketreach", "getprospect"] as const;
export type ProviderId = (typeof ENRICHMENT_PROVIDER_IDS)[number];

// Fixed order. Merge ties break on it, so a tie resolves the same way on every machine and the
// result is testable rather than dependent on which provider happened to answer first.
export const PROVIDER_PRIORITY: readonly ProviderId[] = ENRICHMENT_PROVIDER_IDS;

// What a provider says happened. Exactly one per attempted provider per run.
export type OutcomeKind =
  | "ok"
  | "no_match"
  | "auth"
  | "throttled"
  | "quota"
  | "timeout"
  | "provider_error"
  // The service sat this provider out for a cooldown; it can answer again once that expires.
  | "skipped"
  // The provider declined: this lookup carries no identifier it can search by. Time changes nothing.
  | "unsupported"
  // The stored key would not decrypt, so the provider was never called. Only a new key fixes it.
  | "key_unreadable"
  | "not_entitled";

export interface ProviderCandidate {
  // Canonical key -> value. Providers never emit a key outside CANONICAL_FIELDS.
  fields: Record<string, string | number>;
  // The provider's own id for the matched subject, kept for support questions. Never displayed.
  sourceId?: string;
}

// Calls left in each window, for providers that publish it. Zero is a real value, so absence is
// "the provider did not say", never "none left".
export interface QuotaRemaining {
  hourly?: number;
  daily?: number;
}

export interface ProviderOutcome {
  provider: ProviderId;
  kind: OutcomeKind;
  // Human-readable detail for the dialog footer and the settings card. Never contains a key.
  message?: string;
  // Set for `throttled` and `quota`, from retry-after where the provider supplies one.
  retryAfterIso?: string;
  // Optional: only Apollo publishes remaining-call headers today.
  quotaRemaining?: QuotaRemaining;
  candidate?: ProviderCandidate;
}

export interface PersonLookup {
  providerRef?: string;
  email?: string;
  linkedinUrl?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  companyDomain?: string;
}

export interface OrgLookup {
  domain?: string;
  linkedinUrl?: string;
  name?: string;
}

export interface EnrichmentProvider {
  readonly id: ProviderId;
  matchPerson(input: PersonLookup, apiKey: string, signal: AbortSignal): Promise<ProviderOutcome>;
  matchOrganization(
    input: OrgLookup,
    apiKey: string,
    signal: AbortSignal,
  ): Promise<ProviderOutcome>;
  searchPeople?(
    input: PeopleSearchInput,
    apiKey: string,
    signal: AbortSignal,
  ): Promise<PeopleSearchOutcome>;
}

export interface ProspectProfile {
  providerRef: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  seniority?: string;
  department?: string;
  linkedinUrl?: string;
  city?: string;
  country?: string;
  hasEmail: boolean;
  hasPhone: boolean;
}

export interface PeopleSearchInput {
  companyDomain: string;
  companyName?: string;
  titles?: string[];
  seniorities?: string[];
  page: number;
  perPage: number;
}

export interface PeopleSearchOutcome extends ProviderOutcome {
  profiles: ProspectProfile[];
  hasMore: boolean;
}
