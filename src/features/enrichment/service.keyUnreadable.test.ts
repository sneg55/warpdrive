import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import * as schema from "@/db/schema";
import { toContactActor } from "@/features/contacts/actorAdapters";
import { encryptToken } from "@/features/email/crypto";
import { seedUser, toActor } from "@/features/stats/statsTestHelpers";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedDefaultMappings } from "./mappingsRepo";
import type { EnrichmentProvider, ProviderId, ProviderOutcome } from "./providers/types";
import { runEnrichment } from "./service";

let h: TestDb;
let admin: typeof schema.users.$inferSelect;

const SIG = (): AbortSignal => AbortSignal.timeout(20_000);
const NOW = new Date("2026-08-24T12:00:00.000Z");
const UNREADABLE = { apiKeyEncrypted: Buffer.from("not a sealed key") };

beforeAll(async () => {
  h = await makeTestDb();
  admin = await seedUser(h, { isAdmin: true });
  await seedDefaultMappings(h.db, SIG());
});
afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.db.delete(schema.enrichmentRuns);
  await h.db.delete(schema.enrichmentProviders);
});

function stub(outcome: (id: ProviderId) => ProviderOutcome) {
  return (id: ProviderId): EnrichmentProvider => ({
    id,
    matchPerson: () => Promise.resolve(outcome(id)),
    matchOrganization: () => Promise.resolve(outcome(id)),
  });
}

async function connect(provider: ProviderId, overrides: Record<string, unknown> = {}) {
  await h.db
    .insert(schema.enrichmentProviders)
    .values({
      provider,
      enabled: true,
      apiKeyEncrypted: encryptToken(`key-${provider}`),
      apiKeyHint: "abcd",
      ...overrides,
    })
    .onConflictDoUpdate({ target: schema.enrichmentProviders.provider, set: { enabled: true } });
}

async function seedOrg(values: Partial<typeof schema.organizations.$inferInsert> = {}) {
  const [row] = await h.db
    .insert(schema.organizations)
    .values({
      name: `Acme-${Math.random().toString(36).slice(2)}`,
      domain: "acme.com",
      ownerId: admin.id,
      visibilityLevel: "all",
      ...values,
    })
    .returning();
  if (row === undefined) throw new Error("no org row");
  return row;
}

function run(orgId: string, resolve: (id: ProviderId) => EnrichmentProvider) {
  return runEnrichment(
    h.db,
    toContactActor(toActor(admin)),
    { entityType: "organization", entityId: orgId },
    NOW,
    SIG(),
    resolve,
  );
}

describe("runEnrichment unreadable credentials", () => {
  // Only three things keep an enabled, credentialled provider out of the fan-out: a cooldown, a
  // decrypt that failed, or nothing at all. Reporting the second as a rate limit tells the admin
  // to come back later for a key that will never decrypt until they paste it again.
  it("does not claim a rate limit when the stored key cannot be decrypted", async () => {
    await connect("apollo", UNREADABLE);
    const org = await seedOrg();

    const result = await run(
      org.id,
      stub(() => ({ provider: "apollo", kind: "ok" })),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.id).toBe(ERROR_IDS.ENRICH_KEY_UNREADABLE);
    expect(result.error.context?.providers).toEqual(["apollo"]);
  });

  it("still reports a cooldown when the key is readable and the provider is resting", async () => {
    await connect("apollo", { throttledUntil: new Date(NOW.getTime() + 60_000) });
    const org = await seedOrg();

    const result = await run(
      org.id,
      stub(() => ({ provider: "apollo", kind: "ok" })),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.id).toBe(ERROR_IDS.ENRICH_THROTTLED);
  });

  // Another provider answering does not make the unreadable key a limit: waiting cannot fix it.
  it("does not claim a rate limit when an unreadable key sits beside an unsupported lookup", async () => {
    await connect("apollo", UNREADABLE);
    await connect("getprospect");
    const org = await seedOrg();

    const result = await run(
      org.id,
      stub((id) => ({ provider: id, kind: "unsupported" })),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.id).toBe(ERROR_IDS.ENRICH_KEY_UNREADABLE);
    expect(result.error.context?.providers).toEqual(["apollo"]);
  });

  // The cooling provider resumes on its own, so its deadline is worth showing even next to a key
  // that will never start working by itself.
  // An unreadable key outranks a cooldown: only one of the two fixes itself, and told to come
  // back at the resume time the admin returns to find that provider just as dead.
  it("names the unreadable key even when a real cooldown stands beside it", async () => {
    await connect("apollo", UNREADABLE);
    await connect("rocketreach", {
      throttledUntil: new Date("2026-08-24T15:00:00.000Z"),
      throttleReason: "throttled",
    });
    await connect("getprospect");
    const org = await seedOrg();

    const result = await run(
      org.id,
      stub((id) => ({ provider: id, kind: "unsupported" })),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.id).toBe(ERROR_IDS.ENRICH_KEY_UNREADABLE);
    expect(result.error.context?.providers).toEqual(["apollo"]);
    // The resume time is still carried, so nothing is lost by leading with the broken key.
    expect(result.error.context?.earliestRetryIso).toBe("2026-08-24T15:00:00.000Z");
  });
});
