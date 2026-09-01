import { AppError, ERROR_IDS } from "@/constants/errorIds";
import * as schema from "@/db/schema";
import { toContactActor } from "@/features/contacts/actorAdapters";
import type { ContactActor } from "@/features/contacts/personsRepo";
import { encryptToken } from "@/features/email/crypto";
import { seedUser, toActor } from "@/features/stats/statsTestHelpers";
import { makeTestDb, type TestDb } from "@/test/db";
import type {
  EnrichmentProvider,
  PersonLookup,
  ProspectProfile,
  ProviderId,
  ProviderOutcome,
} from "./providers/types";
import { revealProspects } from "./revealService";

export const SIG = (): AbortSignal => AbortSignal.timeout(20_000);
export const NOW = new Date("2026-08-31T12:00:00.000Z");
export const BATCH = "11111111-1111-4111-8111-111111111111";
export const OTHER_BATCH = "22222222-2222-4222-8222-222222222222";

export interface RevealKit {
  h: TestDb;
  admin: ContactActor;
  regular: ContactActor;
  calls: { provider: ProviderId; lookup: PersonLookup }[];
  connect(provider: ProviderId): Promise<void>;
  seedOrg(domain?: string | null): Promise<string>;
  seedPerson(
    orgId: string,
    values: Partial<typeof schema.persons.$inferInsert>,
  ): Promise<{ id: string; updatedAtIso: string }>;
  reveal(
    orgId: string,
    profiles: ProspectProfile[],
    resolve: (id: ProviderId) => EnrichmentProvider,
    opts?: { actor?: ContactActor; batchId?: string; searchProvider?: ProviderId },
  ): ReturnType<typeof revealProspects>;
  reset(): Promise<void>;
}

export function profileOf(
  providerRef: string,
  over: Partial<ProspectProfile> = {},
): ProspectProfile {
  return {
    providerRef,
    fullName: "Ada Lovelace",
    linkedinUrl: "https://linkedin.com/in/ada",
    hasEmail: true,
    hasPhone: false,
    ...over,
  };
}

export function stubProvider(
  kit: RevealKit,
  answer: (id: ProviderId, lookup: PersonLookup) => ProviderOutcome,
): (id: ProviderId) => EnrichmentProvider {
  return (id) => ({
    id,
    matchPerson: (lookup) => {
      kit.calls.push({ provider: id, lookup });
      return Promise.resolve(answer(id, lookup));
    },
    matchOrganization: () => Promise.resolve({ provider: id, kind: "no_match" as const }),
  });
}

export const foundEmail = (id: ProviderId): ProviderOutcome => ({
  provider: id,
  kind: "ok",
  candidate: { fields: { "person.email": "ada@acme.com" } },
});

export async function makeRevealKit(): Promise<RevealKit> {
  const h = await makeTestDb();
  const admin = toContactActor(toActor(await seedUser(h, { isAdmin: true })));
  const regular = toContactActor(toActor(await seedUser(h)));

  const kit: RevealKit = {
    h,
    admin,
    regular,
    calls: [],
    connect: async (provider) => {
      await h.db.insert(schema.enrichmentProviders).values({
        provider,
        enabled: true,
        apiKeyEncrypted: encryptToken(`key-${provider}`),
        apiKeyHint: "abcd",
      });
    },
    seedOrg: async (domain = "https://www.acme.com/") => {
      const [row] = await h.db
        .insert(schema.organizations)
        .values({ name: "Acme Incorporated", domain, ownerId: admin.id, visibilityLevel: "all" })
        .returning({ id: schema.organizations.id });
      if (row === undefined) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "no organization row");
      return row.id;
    },
    seedPerson: async (orgId, values) => {
      const [row] = await h.db
        .insert(schema.persons)
        .values({
          name: "Ada Lovelace",
          ownerId: admin.id,
          visibilityLevel: "all",
          orgId,
          ...values,
        })
        .returning({ id: schema.persons.id, updatedAt: schema.persons.updatedAt });
      if (row === undefined) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "no person row");
      return { id: row.id, updatedAtIso: row.updatedAt.toISOString() };
    },
    reveal: (orgId, profiles, resolve, opts = {}) =>
      revealProspects(
        h.db,
        opts.actor ?? admin,
        {
          orgId,
          batchId: opts.batchId ?? BATCH,
          searchProvider: opts.searchProvider ?? "apollo",
          profiles,
        },
        NOW,
        SIG(),
        resolve,
      ),
    reset: async () => {
      kit.calls.length = 0;
      await h.db.delete(schema.prospectReveals);
      await h.db.delete(schema.persons);
      await h.db.delete(schema.enrichmentProviders);
    },
  };
  return kit;
}
