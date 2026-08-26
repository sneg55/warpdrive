import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { toContactActor } from "@/features/contacts/actorAdapters";
import { seedUser, toActor } from "@/features/stats/statsTestHelpers";
import { makeTestDb, type TestDb } from "@/test/db";
import { applyEnrichment } from "./applyService";
import { mappingsFingerprint } from "./mappingsFingerprint";
import { listMappings, seedDefaultMappings, setCacheTtlDays } from "./mappingsRepo";
import type { ProviderOutcome } from "./providers/types";
import type { Selection } from "./types";

let h: TestDb;
let admin: typeof schema.users.$inferSelect;

const SIG = (): AbortSignal => AbortSignal.timeout(20_000);
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);

beforeAll(async () => {
  h = await makeTestDb();
  admin = await seedUser(h, { isAdmin: true });
  await seedDefaultMappings(h.db, SIG());
});
afterAll(async () => {
  await h.close();
});

async function seedOrg(values: Partial<typeof schema.organizations.$inferInsert> = {}) {
  const [row] = await h.db
    .insert(schema.organizations)
    .values({
      name: `Acme-${Math.random().toString(36).slice(2)}`,
      ownerId: admin.id,
      visibilityLevel: "all",
      ...values,
    })
    .returning();
  if (row === undefined) throw new Error("no org row");
  return row;
}

async function seedRun(
  entityType: "person" | "organization",
  entityId: string,
  outcomes: ProviderOutcome[],
  createdAt?: Date,
) {
  const [row] = await h.db
    .insert(schema.enrichmentRuns)
    .values({ entityType, entityId, requestedBy: admin.id, outcomes, createdAt })
    .returning();
  if (row === undefined) throw new Error("no run row");
  return row;
}

async function fingerprintForRun(runId: string): Promise<string> {
  const [run] = await h.db
    .select({ entityType: schema.enrichmentRuns.entityType })
    .from(schema.enrichmentRuns)
    .where(eq(schema.enrichmentRuns.id, runId));
  return mappingsFingerprint(await listMappings(h.db, run?.entityType ?? "person", SIG()));
}

async function apply(runId: string, expectedUpdatedAt: Date, selections: Selection[]) {
  const args = {
    runId,
    expectedUpdatedAtIso: expectedUpdatedAt.toISOString(),
    selections,
    mappingsFingerprint: await fingerprintForRun(runId),
  };
  return applyEnrichment(h.db, toContactActor(toActor(admin)), args, new Date(), SIG());
}

const APOLLO = (fields: Record<string, string | number>): ProviderOutcome => ({
  provider: "apollo",
  kind: "ok",
  candidate: { fields },
});

async function readOrg(id: string) {
  const [row] = await h.db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.id, id));
  return row;
}

async function readLogs(entityId: string, field?: string) {
  const byField = field === undefined ? undefined : eq(schema.changeLogs.field, field);
  return h.db
    .select()
    .from(schema.changeLogs)
    .where(and(eq(schema.changeLogs.entityId, entityId), byField));
}

describe("applyEnrichment", () => {
  it("writes the selected built-in fields onto the organization", async () => {
    const org = await seedOrg();
    const run = await seedRun("organization", org.id, [
      APOLLO({ "org.industry": "B2B SaaS", "org.employeeCount": 240 }),
    ]);

    const result = await apply(run.id, org.updatedAt, [
      { canonicalKey: "org.industry", value: "B2B SaaS" },
      { canonicalKey: "org.employeeCount", value: 240 },
    ]);

    expect(result.ok).toBe(true);
    const after = await readOrg(org.id);
    expect(after?.industry).toBe("B2B SaaS");
    expect(after?.employeeCount).toBe(240);
  });

  it("records one change log per applied field, naming the providers behind the value", async () => {
    const org = await seedOrg();
    const run = await seedRun("organization", org.id, [
      APOLLO({ "org.industry": "Fintech" }),
      { provider: "rocketreach", kind: "ok", candidate: { fields: { "org.industry": "fintech" } } },
    ]);

    await apply(run.id, org.updatedAt, [{ canonicalKey: "org.industry", value: "Fintech" }]);

    const logs = await readLogs(org.id, "org.industry");
    expect(logs).toHaveLength(1);
    expect(logs[0]?.newValue).toEqual({
      value: "Fintech",
      providers: ["apollo", "rocketreach"],
    });
    expect(logs[0]?.actorId).toBe(admin.id);
  });

  // An overwrite destroys a value, so the timeline has to say which one.
  it("records the value an overwrite replaced", async () => {
    const org = await seedOrg({ industry: "Retail" });
    const run = await seedRun("organization", org.id, [APOLLO({ "org.industry": "Fintech" })]);

    await apply(run.id, org.updatedAt, [{ canonicalKey: "org.industry", value: "Fintech" }]);

    const logs = await readLogs(org.id, "org.industry");
    expect(logs[0]?.oldValue).toBe("Retail");
    expect(logs[0]?.newValue).toEqual({ value: "Fintech", providers: ["apollo"] });
  });

  it("refuses to write against a record that changed since the run", async () => {
    const org = await seedOrg();
    const run = await seedRun("organization", org.id, [APOLLO({ "org.industry": "Retail" })]);

    const result = await apply(run.id, new Date(org.updatedAt.getTime() - 1000), [
      { canonicalKey: "org.industry", value: "Retail" },
    ]);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.id).toBe("E_ENRICH_006");
    expect((await readOrg(org.id))?.industry).toBeNull();
  });

  // A stale check that rejects but still committed the write would be worse than no check at all.
  it("leaves no change log behind when the staleness check rejects", async () => {
    const org = await seedOrg();
    const run = await seedRun("organization", org.id, [APOLLO({ "org.industry": "Retail" })]);

    await apply(run.id, new Date("2020-01-01T00:00:00.000Z"), [
      { canonicalKey: "org.industry", value: "Retail" },
    ]);

    expect(await readLogs(org.id)).toHaveLength(0);
  });

  it("rejects a value the ordinary edit schema would reject, rather than writing it", async () => {
    const org = await seedOrg();
    const run = await seedRun("organization", org.id, [APOLLO({ "org.domain": "x" })]);

    // Far past the column's max length: the enrichment action must not be a way around the
    // validation the edit form applies.
    const result = await apply(run.id, org.updatedAt, [
      { canonicalKey: "org.domain", value: "d".repeat(5000) },
    ]);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.id).toBe("E_ENRICH_007");
  });

  it("stamps the run as applied", async () => {
    const org = await seedOrg();
    const run = await seedRun("organization", org.id, [APOLLO({ "org.industry": "Energy" })]);

    await apply(run.id, org.updatedAt, [{ canonicalKey: "org.industry", value: "Energy" }]);

    const [after] = await h.db
      .select()
      .from(schema.enrichmentRuns)
      .where(eq(schema.enrichmentRuns.id, run.id));
    expect(after?.appliedFields).toEqual(["org.industry"]);
    expect(after?.appliedAt).not.toBeNull();
  });

  // A cached run can be applied in more than one pass. Overwriting would leave the audit naming
  // only the last batch while the earlier writes stayed committed.
  it("accumulates applied fields across two passes over one run", async () => {
    const org = await seedOrg();
    const run = await seedRun("organization", org.id, [
      APOLLO({ "org.industry": "Mining", "org.employeeCount": 12 }),
    ]);

    await apply(run.id, org.updatedAt, [{ canonicalKey: "org.industry", value: "Mining" }]);
    const mid = await readOrg(org.id);
    if (mid === undefined) throw new Error("no org row");
    await apply(run.id, mid.updatedAt, [{ canonicalKey: "org.employeeCount", value: 12 }]);

    const [after] = await h.db
      .select()
      .from(schema.enrichmentRuns)
      .where(eq(schema.enrichmentRuns.id, run.id));
    expect(after?.appliedFields.sort()).toEqual(["org.employeeCount", "org.industry"]);
  });

  // A server action is a public endpoint. Without this an editor can post any value they like and
  // have it written with a change-log row whose provenance names nobody.
  it("refuses a value no provider in the run reported", async () => {
    const org = await seedOrg();
    const run = await seedRun("organization", org.id, [APOLLO({ "org.industry": "Mining" })]);

    const result = await apply(run.id, org.updatedAt, [
      { canonicalKey: "org.industry", value: "Something Nobody Said" },
    ]);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.id).toBe("E_ENRICH_007");
    expect((await readOrg(org.id))?.industry).toBeNull();
    expect(await readLogs(org.id)).toHaveLength(0);
  });

  it("refuses a canonical key the run never carried at all", async () => {
    const org = await seedOrg();
    const run = await seedRun("organization", org.id, [APOLLO({ "org.industry": "Mining" })]);

    const result = await apply(run.id, org.updatedAt, [
      { canonicalKey: "org.domain", value: "acme.com" },
    ]);

    expect(result.ok === false && result.error.id).toBe("E_ENRICH_007");
  });

  it("still accepts a value spelled differently from how the provider reported it", async () => {
    const org = await seedOrg();
    const run = await seedRun("organization", org.id, [APOLLO({ "org.industry": "Mining" })]);

    const result = await apply(run.id, org.updatedAt, [
      { canonicalKey: "org.industry", value: "  mining  " },
    ]);

    expect(result.ok).toBe(true);
  });

  it("returns a not-found error for a run that does not exist", async () => {
    const result = await apply("00000000-0000-0000-0000-000000000000", new Date(), []);
    expect(result.ok === false && result.error.id).toBe("E_ENRICH_005");
  });

  it("refuses a run that has fallen outside the cache TTL", async () => {
    const org = await seedOrg();
    const run = await seedRun(
      "organization",
      org.id,
      [APOLLO({ "org.industry": "Retail" })],
      daysAgo(31),
    );

    const result = await apply(run.id, org.updatedAt, [
      { canonicalKey: "org.industry", value: "Retail" },
    ]);

    expect(result.ok === false && result.error.id).toBe("E_ENRICH_005");
    expect((await readOrg(org.id))?.industry).toBeNull();
  });

  // A TTL of zero means "never reuse a cached run", not "no run may ever be applied".
  it("still applies an in-flight run when the TTL disables the cache", async () => {
    const org = await seedOrg();
    const run = await seedRun(
      "organization",
      org.id,
      [APOLLO({ "org.industry": "Shipping" })],
      daysAgo(400),
    );

    await setCacheTtlDays(h.db, 0, SIG());
    try {
      const result = await apply(run.id, org.updatedAt, [
        { canonicalKey: "org.industry", value: "Shipping" },
      ]);
      expect(result.ok).toBe(true);
      expect((await readOrg(org.id))?.industry).toBe("Shipping");
    } finally {
      await setCacheTtlDays(h.db, 30, SIG());
    }
  });
});
