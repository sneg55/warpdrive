import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import type { ContactActor } from "@/features/contacts/personsRepo";
import { encryptToken } from "@/features/email/crypto";
import type {
  EnrichmentProvider,
  PeopleSearchInput,
  PeopleSearchOutcome,
  ProspectProfile,
  ProviderId,
} from "./providers/types";

export const NOW = new Date("2026-08-31T12:00:00.000Z");
export const CREATOR = new Set<PermissionFlagKey>(["contact.create"]);
export const NO_FLAGS = new Set<PermissionFlagKey>();
export const MISSING_ORG_ID = "00000000-0000-4000-8000-000000000abc";

export const SIG = (): AbortSignal => AbortSignal.timeout(30_000);

export function actorFor(id: string, flags: ReadonlySet<PermissionFlagKey>): ContactActor {
  return {
    id,
    type: "regular",
    isActive: true,
    groupIds: new Set<string>(),
    flags,
    primaryVisibilityGroupId: null,
  };
}

export function profileOf(
  over: Partial<ProspectProfile> & { providerRef: string },
): ProspectProfile {
  return { fullName: "Ada Lovelace", hasEmail: true, hasPhone: false, ...over };
}

export function found(profiles: ProspectProfile[], hasMore: boolean): PeopleSearchOutcome {
  return { provider: "apollo", kind: "ok", profiles, hasMore };
}

export interface Recorder {
  calls: PeopleSearchInput[];
}

export function stub(
  answer: (input: PeopleSearchInput) => Promise<PeopleSearchOutcome>,
  recorder: Recorder = { calls: [] },
  capable = true,
): (id: ProviderId) => EnrichmentProvider {
  return (id: ProviderId): EnrichmentProvider => {
    const base: EnrichmentProvider = {
      id,
      matchPerson: () => Promise.resolve({ provider: id, kind: "no_match" as const }),
      matchOrganization: () => Promise.resolve({ provider: id, kind: "no_match" as const }),
    };
    if (!capable) return base;
    return {
      ...base,
      searchPeople: (input) => {
        recorder.calls.push(input);
        return answer(input);
      },
    };
  };
}

export async function connect(db: Db, provider: ProviderId): Promise<void> {
  await db.insert(schema.enrichmentProviders).values({
    provider,
    enabled: true,
    apiKeyEncrypted: encryptToken(`key-${provider}`),
    apiKeyHint: "abcd",
  });
}

export async function seedOrg(
  db: Db,
  ownerId: string,
  values: Partial<typeof schema.organizations.$inferInsert> = {},
): Promise<typeof schema.organizations.$inferSelect> {
  const [row] = await db
    .insert(schema.organizations)
    .values({
      name: `Acme-${Math.random().toString(36).slice(2)}`,
      domain: "acme.com",
      ownerId,
      visibilityLevel: "all",
      ...values,
    })
    .returning();
  if (row === undefined) {
    throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedOrg: insert returned no rows", {});
  }
  return row;
}
