import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import * as schema from "@/db/schema";
import { toContactActor } from "@/features/contacts/actorAdapters";
import { seedUser, toActor } from "@/features/stats/statsTestHelpers";
import { makeTestDb, type TestDb } from "@/test/db";
import { applyEnrichment } from "./applyService";
import { mappingsFingerprint } from "./mappingsFingerprint";
import { listMappings, seedDefaultMappings } from "./mappingsRepo";
import type { ProviderOutcome } from "./providers/types";
import type { Selection } from "./types";

let h: TestDb;
let admin: typeof schema.users.$inferSelect;

const SIG = (): AbortSignal => AbortSignal.timeout(20_000);

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

async function apply(
  runId: string,
  expectedUpdatedAt: Date,
  selections: Selection[],
  as: typeof schema.users.$inferSelect = admin,
  flags: readonly PermissionFlagKey[] = [],
) {
  const args = {
    runId,
    expectedUpdatedAtIso: expectedUpdatedAt.toISOString(),
    selections,
    mappingsFingerprint: await fingerprintForRun(runId),
  };
  const actor = { ...toActor(as), flags: new Set(flags) };
  return applyEnrichment(h.db, toContactActor(actor), args, new Date(), SIG());
}

const APOLLO = (fields: Record<string, string | number>): ProviderOutcome => ({
  provider: "apollo",
  kind: "ok",
  candidate: { fields },
});

describe("applyEnrichment person writes", () => {
  // persons.primary_email is a column of its own and imports produce rows whose emails array does
  // not carry it. updatePerson re-derives the primary from the array in the patch, so a write that
  // omits emails, such as linking a company, deletes the address.
  it("keeps a primary email held only in the column when it links a company", async () => {
    const org = await seedOrg({ name: "Soylent Holdings", domain: "soylent.test" });
    const [person] = await h.db
      .insert(schema.persons)
      .values({
        name: `Pat-${Math.random().toString(36).slice(2)}`,
        ownerId: admin.id,
        visibilityLevel: "all",
        primaryEmail: "pat@soylent.test",
        emails: [],
      })
      .returning();
    if (person === undefined) throw new Error("no person row");
    const run = await seedRun("person", person.id, [
      APOLLO({ "person.companyName": "Soylent", "person.companyDomain": "soylent.test" }),
    ]);

    const result = await apply(run.id, person.updatedAt, [
      { canonicalKey: "person.companyName", value: "Soylent" },
    ]);

    expect(result.ok).toBe(true);
    const [after] = await h.db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.id, person.id));
    expect(after?.orgId).toBe(org.id);
    expect(after?.primaryEmail).toBe("pat@soylent.test");
  });

  // An email is added to the set, never swapped for the one already there, so logging the old
  // primary as the value replaced makes the timeline read as a replacement that never happened.
  it("logs an added email as an addition rather than a replacement", async () => {
    const [person] = await h.db
      .insert(schema.persons)
      .values({
        name: `Pat-${Math.random().toString(36).slice(2)}`,
        ownerId: admin.id,
        visibilityLevel: "all",
        primaryEmail: "old@vandelay.test",
        emails: [{ label: "work", value: "old@vandelay.test", primary: true }],
      })
      .returning();
    if (person === undefined) throw new Error("no person row");
    const run = await seedRun("person", person.id, [
      APOLLO({ "person.email": "new@vandelay.test" }),
    ]);

    const result = await apply(run.id, person.updatedAt, [
      { canonicalKey: "person.email", value: "new@vandelay.test" },
    ]);
    expect(result.ok).toBe(true);

    const [logged] = await h.db
      .select()
      .from(schema.changeLogs)
      .where(eq(schema.changeLogs.entityId, person.id));
    expect(logged?.field).toBe("person.email");
    expect(logged?.oldValue).toBeNull();
    expect(logged?.newValue).toMatchObject({ value: "new@vandelay.test" });

    const [after] = await h.db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.id, person.id));
    expect(after?.emails.map((e) => e.value)).toContain("old@vandelay.test");
    expect(after?.emails.map((e) => e.value)).toContain("new@vandelay.test");
  });
});
