import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { toContactActor } from "@/features/contacts/actorAdapters";
import { seedUser, toActor } from "@/features/stats/statsTestHelpers";
import { makeTestDb, type TestDb } from "@/test/db";
import { applyEnrichment } from "./applyService";
import { mappingsFingerprint } from "./mappingsFingerprint";
import { listMappings, seedDefaultMappings, upsertMapping } from "./mappingsRepo";
import type { ProviderOutcome } from "./providers/types";
import type { Selection } from "./types";

let h: TestDb;
let admin: typeof schema.users.$inferSelect;

const SIG = (): AbortSignal => AbortSignal.timeout(20_000);
const uniq = (): string => Math.random().toString(36).slice(2);

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
      name: `Acme-${uniq()}`,
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
) {
  const [row] = await h.db
    .insert(schema.enrichmentRuns)
    .values({ entityType, entityId, requestedBy: admin.id, outcomes })
    .returning();
  if (row === undefined) throw new Error("no run row");
  return row;
}

async function apply(runId: string, expectedUpdatedAt: Date, selections: Selection[]) {
  const [run] = await h.db
    .select({ entityType: schema.enrichmentRuns.entityType })
    .from(schema.enrichmentRuns)
    .where(eq(schema.enrichmentRuns.id, runId));
  const entity = run?.entityType ?? "person";
  return applyEnrichment(
    h.db,
    toContactActor(toActor(admin)),
    {
      runId,
      expectedUpdatedAtIso: expectedUpdatedAt.toISOString(),
      selections,
      mappingsFingerprint: mappingsFingerprint(await listMappings(h.db, entity, SIG())),
    },
    new Date(),
    SIG(),
  );
}

const APOLLO = (fields: Record<string, string | number>): ProviderOutcome => ({
  provider: "apollo",
  kind: "ok",
  candidate: { fields },
});

async function readLog(entityId: string, field: string) {
  const [row] = await h.db
    .select()
    .from(schema.changeLogs)
    .where(and(eq(schema.changeLogs.entityId, entityId), eq(schema.changeLogs.field, field)));
  return row;
}

// The planner coerces a provider value to what the target column can hold (money is rounded to two
// decimals). Logging the raw selection instead makes the timeline name a value the record never had.
describe("applyEnrichment change-log values", () => {
  it("logs the rounded revenue the column holds, not the provider's raw number", async () => {
    const org = await seedOrg();
    const run = await seedRun("organization", org.id, [
      APOLLO({ "org.annualRevenue": 1234567.891 }),
      {
        provider: "rocketreach",
        kind: "ok",
        candidate: { fields: { "org.annualRevenue": "1234567.891" } },
      },
    ]);

    const result = await apply(run.id, org.updatedAt, [
      { canonicalKey: "org.annualRevenue", value: 1234567.891 },
    ]);
    expect(result.ok).toBe(true);

    const [after] = await h.db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, org.id));
    expect(after?.annualRevenue).toBe("1234567.89");

    const logged = await readLog(org.id, "org.annualRevenue");
    expect(logged?.newValue).toEqual({
      value: after?.annualRevenue,
      providers: ["apollo", "rocketreach"],
    });
  });

  it("logs a plain string field verbatim", async () => {
    const org = await seedOrg();
    const run = await seedRun("organization", org.id, [APOLLO({ "org.industry": "B2B SaaS" })]);

    const result = await apply(run.id, org.updatedAt, [
      { canonicalKey: "org.industry", value: "B2B SaaS" },
    ]);
    expect(result.ok).toBe(true);

    const logged = await readLog(org.id, "org.industry");
    expect(logged?.newValue).toEqual({ value: "B2B SaaS", providers: ["apollo"] });
  });

  it("logs the rounded number a numeric custom field holds", async () => {
    const [def] = await h.db
      .insert(schema.customFieldDefs)
      .values({
        targetEntity: "organization",
        type: "monetary",
        name: `Revenue ${uniq()}`,
        key: `f_${uniq()}`,
      })
      .returning();
    if (def === undefined) throw new Error("no custom field def");
    const mapped = await upsertMapping(
      h.db,
      "organization",
      "org.annualRevenue",
      { kind: "custom", fieldDefId: def.id },
      SIG(),
    );
    expect(mapped.ok).toBe(true);

    try {
      const org = await seedOrg();
      const run = await seedRun("organization", org.id, [
        APOLLO({ "org.annualRevenue": 987.6543 }),
      ]);

      const result = await apply(run.id, org.updatedAt, [
        { canonicalKey: "org.annualRevenue", value: 987.6543 },
      ]);
      expect(result.ok).toBe(true);

      const [after] = await h.db
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.id, org.id));
      const fields = after?.customFields as Record<string, unknown>;
      expect(fields[def.key]).toBe(987.65);

      const logged = await readLog(org.id, "org.annualRevenue");
      expect(logged?.newValue).toEqual({ value: 987.65, providers: ["apollo"] });
    } finally {
      await upsertMapping(
        h.db,
        "organization",
        "org.annualRevenue",
        { kind: "builtin", key: "annualRevenue" },
        SIG(),
      );
    }
  });

  // A company name resolves to an organization link, so there is no coerced scalar to log.
  it("logs the selected company name when a person is linked", async () => {
    const org = await seedOrg({ name: "Soylent Holdings", domain: `soylent-${uniq()}.test` });
    const [person] = await h.db
      .insert(schema.persons)
      .values({ name: `Pat-${uniq()}`, ownerId: admin.id, visibilityLevel: "all" })
      .returning();
    if (person === undefined) throw new Error("no person row");
    const run = await seedRun("person", person.id, [
      APOLLO({ "person.companyName": "Soylent Holdings" }),
    ]);

    const result = await apply(run.id, person.updatedAt, [
      { canonicalKey: "person.companyName", value: "Soylent Holdings" },
    ]);
    expect(result.ok).toBe(true);

    const [after] = await h.db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.id, person.id));
    expect(after?.orgId).toBe(org.id);

    const logged = await readLog(person.id, "person.companyName");
    expect(logged?.newValue).toEqual({ value: "Soylent Holdings", providers: ["apollo"] });
  });
});
