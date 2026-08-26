import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { seedUser } from "@/features/stats/statsTestHelpers";
import { makeTestDb, type TestDb } from "@/test/db";
import type { ProviderOutcome } from "./providers/types";
import { findCachedRun, insertRun } from "./runsRepo";

let h: TestDb;
let admin: typeof schema.users.$inferSelect;

const SIG = (): AbortSignal => AbortSignal.timeout(20_000);
const DAY_MS = 24 * 60 * 60 * 1000;
const TTL_DAYS = 30;

const JANE = "companyDomain=acme.com|companyName=acme inc|email=jane@acme.com";
const JANE_AT_GLOBEX = "companyDomain=globex.com|companyName=globex|email=jane@globex.com";

const OUTCOMES: ProviderOutcome[] = [
  { provider: "apollo", kind: "ok", candidate: { fields: { "person.title": "CTO" } } },
];

beforeAll(async () => {
  h = await makeTestDb();
  admin = await seedUser(h, { isAdmin: true });
});
afterAll(async () => {
  await h.close();
});

function store(entityId: string, fingerprint: string) {
  return insertRun(
    h.db,
    {
      entityType: "person",
      entityId,
      requestedBy: admin.id,
      outcomes: OUTCOMES,
      lookupFingerprint: fingerprint,
    },
    SIG(),
  );
}

function find(entityId: string, fingerprint: string, ttlDays = TTL_DAYS, now = new Date()) {
  return findCachedRun(h.db, "person", entityId, fingerprint, ttlDays, now, SIG());
}

describe("findCachedRun", () => {
  it("reuses a run researched for the identity the record still has", async () => {
    const entityId = randomUUID();
    const run = await store(entityId, JANE);

    expect((await find(entityId, JANE))?.id).toBe(run.id);
  });

  it("stores the fingerprint it was handed", async () => {
    const run = await store(randomUUID(), JANE);

    expect(run.lookupFingerprint).toBe(JANE);
  });

  it("ignores a run researched for a different identity", async () => {
    const entityId = randomUUID();
    await store(entityId, JANE);

    expect(await find(entityId, JANE_AT_GLOBEX)).toBeNull();
  });

  it("ignores a run stored before fingerprints existed, since its identity is unprovable", async () => {
    const entityId = randomUUID();
    await h.db.insert(schema.enrichmentRuns).values({
      entityType: "person",
      entityId,
      requestedBy: admin.id,
      outcomes: OUTCOMES,
    });

    expect(await find(entityId, JANE)).toBeNull();
  });

  it("still expires a matching run once it is older than the TTL", async () => {
    const entityId = randomUUID();
    await store(entityId, JANE);

    const later = new Date(Date.now() + (TTL_DAYS + 1) * DAY_MS);
    expect(await find(entityId, JANE, TTL_DAYS, later)).toBeNull();
  });

  it("treats a TTL of zero as caching turned off", async () => {
    const entityId = randomUUID();
    await store(entityId, JANE);

    expect(await find(entityId, JANE, 0)).toBeNull();
  });

  it("skips a newer run for another identity in favour of one that still matches", async () => {
    const entityId = randomUUID();
    const matching = await store(entityId, JANE);
    await store(entityId, JANE_AT_GLOBEX);

    expect((await find(entityId, JANE))?.id).toBe(matching.id);
  });
});
