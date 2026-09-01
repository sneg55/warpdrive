import type { Organization } from "@/db/schema";
import type { ContactActor } from "@/features/contacts/personsRepo";
import type { ProspectMatch } from "./prospectDedup";
import type { ProspectMergeBase } from "./prospectMerge";
import type {
  EnrichmentProvider,
  ProspectProfile,
  ProviderId,
  ProviderOutcome,
} from "./providers/types";
import type { UsableProvider } from "./providersRepo";
import type { ProposedField, ResolvedMapping } from "./types";

export interface RevealedProspect {
  providerRef: string;
  profile: ProspectProfile;
  outcomes: ProviderOutcome[];
  fields: ProposedField[];
  match: ProspectMatch;
}

export interface RevealFailure {
  providerRef: string;
  errorId: string;
}

export interface RevealBatch {
  items: RevealedProspect[];
  failures: RevealFailure[];
  mappingsFingerprint: string;
}

export interface RevealProspectsInput {
  orgId: string;
  batchId: string;
  searchProvider: ProviderId;
  profiles: ProspectProfile[];
}

export interface RevealContext {
  actor: ContactActor;
  org: Organization;
  input: RevealProspectsInput;
  usable: readonly UsableProvider[];
  mappings: readonly ResolvedMapping[];
  bases: ReadonlyMap<string, ProspectMergeBase>;
  resolveProvider: (id: ProviderId) => EnrichmentProvider;
}
