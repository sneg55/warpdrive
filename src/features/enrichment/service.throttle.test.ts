import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { toContactActor } from "@/features/contacts/actorAdapters";
import { encryptToken } from "@/features/email/crypto";
import { seedUser, toActor } from "@/features/stats/statsTestHelpers";
import { makeTestDb, type TestDb } from "@/test/db";
import type { EnrichmentProvider, ProviderId, ProviderOutcome } from "./providers/types";
import { runEnrichment } from "./service";

let h: TestDb;
let admin: typeof schema.users.$inferSelect;

const SIG = (): AbortSignal => AbortSignal.timeout(20_000);
const NOW = new Date("2026-08-24T12:00:00.000Z");

beforeAll(async () => {
  h = await makeTestDb();
  admin = await seedUser(h, { isAdmin: true });
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

function run(orgId: string, resolve: (id: ProviderId) => EnrichmentProvider, refresh = false) {
  return runEnrichment(
    h.db,
    toContactActor(toActor(admin)),
    { entityType: "organization", entityId: orgId, refresh },
    NOW,
    SIG(),
    resolve,
  );
}

describe("runEnrichment rate limiting", () => {
  it("reports throttling, with the resume time, when every first attempt is rate limited", async () => {
    await connect("apollo");
    await connect("getprospect");
    const org = await seedOrg();

    const result = await run(
      org.id,
      stub((id) => ({
        provider: id,
        kind: id === "apollo" ? "throttled" : "quota",
        retryAfterIso: id === "apollo" ? "2026-08-24T13:30:00.000Z" : "2026-08-25T12:00:00.000Z",
      })),
    );
    expect(result.ok === false && result.error.id).toBe("E_ENRICH_003");
    expect(result.ok === false && result.error.context?.earliestRetryIso).toBe(
      "2026-08-24T13:30:00.000Z",
    );
  });

  it("persists a run even when nobody answered, so a retry does not dial out again", async () => {
    await connect("apollo");
    const org = await seedOrg();

    await run(
      org.id,
      stub((id) => ({ provider: id, kind: "timeout" })),
    );

    const rows = await h.db
      .select()
      .from(schema.enrichmentRuns)
      .where(eq(schema.enrichmentRuns.entityId, org.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.outcomes[0]?.kind).toBe("timeout");

    let called = false;
    await run(org.id, (id) => ({
      id,
      matchPerson: () => Promise.resolve({ provider: id, kind: "no_match" as const }),
      matchOrganization: () => {
        called = true;
        return Promise.resolve({ provider: id, kind: "no_match" as const });
      },
    }));
    expect(called).toBe(false);
  });

  it("does not claim a rate limit when the only provider could not use the lookup", async () => {
    await connect("apollo");
    const org = await seedOrg();

    const result = await run(
      org.id,
      stub((id) => ({ provider: id, kind: "unsupported", message: "No usable lookup identifier" })),
    );
    expect(result.ok === false && result.error.id).toBe("E_ENRICH_011");
    expect(result.ok === false && result.error.context?.earliestRetryIso).toBe(null);
  });

  it("still reports throttling when a cooldown is mixed with an unsupported lookup", async () => {
    await connect("apollo");
    await connect("getprospect", {
      throttledUntil: new Date("2026-08-24T15:00:00.000Z"),
      throttleReason: "throttled",
    });
    const org = await seedOrg();

    const result = await run(
      org.id,
      stub((id) => ({ provider: id, kind: "unsupported" })),
    );
    expect(result.ok === false && result.error.id).toBe("E_ENRICH_003");
    expect(result.ok === false && result.error.context?.earliestRetryIso).toBe(
      "2026-08-24T15:00:00.000Z",
    );
  });
});
