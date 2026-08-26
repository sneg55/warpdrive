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

// Fails the test by flipping `called` if the second click reaches a provider at all.
function neverCalled(seen: { called: boolean }) {
  return (id: ProviderId): EnrichmentProvider => ({
    id,
    matchPerson: () => {
      seen.called = true;
      return Promise.resolve({ provider: id, kind: "no_match" as const });
    },
    matchOrganization: () => {
      seen.called = true;
      return Promise.resolve({ provider: id, kind: "no_match" as const });
    },
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

function run(
  orgId: string,
  resolve: (id: ProviderId) => EnrichmentProvider,
  at: Date = NOW,
  refresh = false,
) {
  return runEnrichment(
    h.db,
    toContactActor(toActor(admin)),
    { entityType: "organization", entityId: orgId, refresh },
    at,
    SIG(),
    resolve,
  );
}

describe("runEnrichment cache hits", () => {
  // The second click reads the same all-failed run out of the cache. Handed back as a success it
  // renders as "Nothing new found" and the rejected key, timeout or outage disappears.
  it("repeats the failure rather than reading an all-failed run as empty", async () => {
    await connect("apollo");
    await connect("getprospect");
    const org = await seedOrg();

    const first = await run(
      org.id,
      stub((id) => ({ provider: id, kind: id === "apollo" ? "auth" : "timeout" })),
    );
    expect(first.ok === false && first.error.id).toBe("E_ENRICH_009");

    const seen = { called: false };
    const second = await run(org.id, neverCalled(seen));

    expect(seen.called).toBe(false);
    expect(second.ok === false && second.error.id).toBe("E_ENRICH_009");
    expect(second.ok === false && second.error.context?.reasons).toEqual({
      apollo: "auth",
      getprospect: "timeout",
    });
  });

  it("repeats an unsupported lookup as unsupported, not as an empty result", async () => {
    await connect("apollo");
    const org = await seedOrg();

    await run(
      org.id,
      stub((id) => ({ provider: id, kind: "unsupported" })),
    );
    const seen = { called: false };
    const second = await run(org.id, neverCalled(seen));

    expect(seen.called).toBe(false);
    expect(second.ok === false && second.error.id).toBe("E_ENRICH_011");
  });

  it("still hands back a cached run that did find something", async () => {
    await connect("apollo");
    const org = await seedOrg();
    await run(
      org.id,
      stub((id) => ({
        provider: id,
        kind: "ok",
        candidate: { fields: { "org.industry": "Shipping" } },
      })),
    );

    const seen = { called: false };
    const second = await run(org.id, neverCalled(seen));

    expect(seen.called).toBe(false);
    expect(second.ok && second.value.cached).toBe(true);
    const field = second.ok
      ? second.value.fields.find((f) => f.canonicalKey === "org.industry")
      : null;
    expect(field?.values[0]?.value).toBe("Shipping");
  });

  it("keeps a cached resume time that has not arrived yet", async () => {
    await connect("apollo");
    const org = await seedOrg();
    await run(
      org.id,
      stub((id) => ({
        provider: id,
        kind: "throttled",
        retryAfterIso: "2026-08-24T13:30:00.000Z",
      })),
    );

    const second = await run(org.id, neverCalled({ called: false }));

    expect(second.ok === false && second.error.id).toBe("E_ENRICH_003");
    expect(second.ok === false && second.error.context?.earliestRetryIso).toBe(
      "2026-08-24T13:30:00.000Z",
    );
  });

  // Come back at 13:30 is not something to tell someone at 15:00. The failure is still the cached
  // one, so the id stands; only the dead deadline goes.
  it("drops a cached resume time that has already passed", async () => {
    await connect("apollo");
    const org = await seedOrg();
    await run(
      org.id,
      stub((id) => ({
        provider: id,
        kind: "throttled",
        retryAfterIso: "2026-08-24T13:30:00.000Z",
      })),
    );

    const seen = { called: false };
    const later = await run(org.id, neverCalled(seen), new Date("2026-08-24T15:00:00.000Z"));

    expect(seen.called).toBe(false);
    expect(later.ok === false && later.error.id).toBe("E_ENRICH_003");
    expect(later.ok === false && later.error.context?.earliestRetryIso).toBe(null);
  });
});
