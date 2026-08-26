import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

describe("runEnrichment", () => {
  it("merges what the providers agree on and credits both", async () => {
    await connect("apollo");
    await connect("rocketreach");
    const org = await seedOrg();

    const result = await run(
      org.id,
      stub((id) => ({
        provider: id,
        kind: "ok",
        candidate: { fields: { "org.industry": "Fintech" } },
      })),
    );

    expect(result.ok).toBe(true);
    const field = result.ok
      ? result.value.fields.find((f) => f.canonicalKey === "org.industry")
      : null;
    expect(field?.values[0]?.providers.sort()).toEqual(["apollo", "rocketreach"]);
  });

  it("reuses a cached run instead of calling out again", async () => {
    await connect("apollo");
    const org = await seedOrg();
    const first = await run(
      org.id,
      stub((id) => ({
        provider: id,
        kind: "ok",
        candidate: { fields: { "org.industry": "Retail" } },
      })),
    );
    expect(first.ok).toBe(true);

    let called = false;
    const second = await run(org.id, (id) => ({
      id,
      matchPerson: () => {
        called = true;
        return Promise.resolve({ provider: id, kind: "no_match" as const });
      },
      matchOrganization: () => {
        called = true;
        return Promise.resolve({ provider: id, kind: "no_match" as const });
      },
    }));

    expect(called).toBe(false);
    expect(second.ok && second.value.cached).toBe(true);
  });

  it("calls out again when refresh is asked for", async () => {
    await connect("apollo");
    const org = await seedOrg();
    await run(
      org.id,
      stub((id) => ({ provider: id, kind: "ok", candidate: { fields: {} } })),
    );

    let called = false;
    const again = await run(
      org.id,
      (id) => ({
        id,
        matchPerson: () => Promise.resolve({ provider: id, kind: "no_match" as const }),
        matchOrganization: () => {
          called = true;
          return Promise.resolve({ provider: id, kind: "no_match" as const });
        },
      }),
      true,
    );

    expect(called).toBe(true);
    expect(again.ok && again.value.cached).toBe(false);
  });

  it("says nothing is configured when no provider is connected", async () => {
    const org = await seedOrg();
    const result = await run(
      org.id,
      stub((id) => ({ provider: id, kind: "no_match" })),
    );
    expect(result.ok === false && result.error.id).toBe("E_ENRICH_001");
  });

  it("says when to come back if every connected provider is cooling down", async () => {
    await connect("apollo", {
      throttledUntil: new Date("2026-08-24T14:20:00.000Z"),
      throttleReason: "throttled",
    });
    const org = await seedOrg();

    const result = await run(
      org.id,
      stub((id) => ({ provider: id, kind: "no_match" })),
    );
    expect(result.ok === false && result.error.id).toBe("E_ENRICH_003");
    expect(result.ok === false && result.error.context?.earliestRetryIso).toBe(
      "2026-08-24T14:20:00.000Z",
    );
  });

  // Without this the footer shows two sources and no hint a third exists, which reads as the
  // whole picture rather than a degraded one.
  it("still lists a provider it skipped for a cooldown", async () => {
    await connect("apollo");
    await connect("rocketreach", {
      throttledUntil: new Date("2026-08-24T14:20:00.000Z"),
      throttleReason: "quota",
    });
    const org = await seedOrg();

    const result = await run(
      org.id,
      stub((id) => ({ provider: id, kind: "ok", candidate: { fields: {} } })),
    );
    const skipped = result.ok
      ? result.value.outcomes.find((o) => o.provider === "rocketreach")
      : null;
    expect(skipped?.kind).toBe("skipped");
    expect(skipped?.retryAfterIso).toBe("2026-08-24T14:20:00.000Z");
  });

  it("records a 429 cooldown on the provider row", async () => {
    await connect("apollo");
    const org = await seedOrg();

    await run(
      org.id,
      stub((id) => ({
        provider: id,
        kind: "throttled",
        retryAfterIso: "2026-08-24T13:00:00.000Z",
      })),
    );

    const [row] = await h.db
      .select()
      .from(schema.enrichmentProviders)
      .where(eq(schema.enrichmentProviders.provider, "apollo"));
    expect(row?.throttledUntil?.toISOString()).toBe("2026-08-24T13:00:00.000Z");
    // A cooldown must never switch a provider off: the admin owns that toggle.
    expect(row?.enabled).toBe(true);
  });

  it("fails only when every provider failed, and names why", async () => {
    await connect("apollo");
    await connect("getprospect");
    const org = await seedOrg();

    const result = await run(
      org.id,
      stub((id) => ({ provider: id, kind: id === "apollo" ? "auth" : "timeout" })),
    );
    expect(result.ok === false && result.error.id).toBe("E_ENRICH_009");
    expect(result.ok === false && result.error.context?.reasons).toEqual({
      apollo: "auth",
      getprospect: "timeout",
    });
  });

  it("succeeds on a partial result when one provider answered", async () => {
    await connect("apollo");
    await connect("getprospect");
    const org = await seedOrg();

    const result = await run(
      org.id,
      stub((id) =>
        id === "apollo"
          ? { provider: id, kind: "ok", candidate: { fields: { "org.industry": "Energy" } } }
          : { provider: id, kind: "auth" },
      ),
    );
    expect(result.ok).toBe(true);
  });

  it("refuses a record with nothing to look it up by", async () => {
    await connect("apollo");
    const org = await seedOrg({ name: "   ", domain: null });

    const result = await run(
      org.id,
      stub((id) => ({ provider: id, kind: "no_match" })),
    );
    expect(result.ok === false && result.error.id).toBe("E_ENRICH_004");
  });

  it("404-shapes a record the actor cannot see", async () => {
    await connect("apollo");
    const stranger = await seedUser(h);
    const org = await seedOrg({ ownerId: admin.id, visibilityLevel: "owner" });

    const result = await runEnrichment(
      h.db,
      toContactActor(toActor(stranger)),
      { entityType: "organization", entityId: org.id },
      NOW,
      SIG(),
      stub((id) => ({ provider: id, kind: "no_match" })),
    );
    expect(result.ok === false && result.error.id).toBe("E_CONTACT_001");
  });
});
