export const ENRICHMENT_PROVIDER_IDS = ["apollo", "rocketreach", "getprospect"] as const;
export type ProviderId = (typeof ENRICHMENT_PROVIDER_IDS)[number];

export const PROVIDER_PRIORITY: readonly ProviderId[] = ENRICHMENT_PROVIDER_IDS;

export type OutcomeKind =
  | "ok"
  | "no_match"
  | "auth"
  | "throttled"
  | "quota"
  | "timeout"
  | "provider_error"
  | "skipped"
  | "unsupported"
  | "key_unreadable"
  | "not_entitled";

export interface ProviderCandidate {
  fields: Record<string, string | number>;
  sourceId?: string;
}

export interface QuotaRemaining {
  hourly?: number;
  daily?: number;
}

export interface ProviderOutcome {
  provider: ProviderId;
  kind: OutcomeKind;
  message?: string;
  retryAfterIso?: string;
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
