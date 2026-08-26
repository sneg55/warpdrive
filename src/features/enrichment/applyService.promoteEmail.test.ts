// Promoting an enriched address end to end. What matters against a real database is that
// updatePerson's re-derivation lands on the promoted address, that nothing is deleted, and that
// the change log names the address the promotion displaced rather than reporting an append.
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
const uniq = (): string => Math.random().toString(36).slice(2);
const NEW_EMAIL = "nick@company.com";

beforeAll(async () => {
  h = await makeTestDb();
  admin = await seedUser(h, { isAdmin: true });
  await seedDefaultMappings(h.db, SIG());
});
afterAll(async () => {
  await h.close();
});

async function seedPerson(values: Partial<typeof schema.persons.$inferInsert> = {}) {
  const [row] = await h.db
    .insert(schema.persons)
    .values({
      name: `Nick-${uniq()}`,
      ownerId: admin.id,
      visibilityLevel: "all",
      ...values,
    })
    .returning();
  if (row === undefined) throw new Error("no person row");
  return row;
}

async function seedRun(entityId: string, outcomes: ProviderOutcome[]) {
  const [row] = await h.db
    .insert(schema.enrichmentRuns)
    .values({ entityType: "person", entityId, requestedBy: admin.id, outcomes })
    .returning();
  if (row === undefined) throw new Error("no run row");
  return row;
}

async function apply(runId: string, expectedUpdatedAt: Date, selections: Selection[]) {
  return applyEnrichment(
    h.db,
    toContactActor(toActor(admin)),
    {
      runId,
      expectedUpdatedAtIso: expectedUpdatedAt.toISOString(),
      selections,
      mappingsFingerprint: mappingsFingerprint(await listMappings(h.db, "person", SIG())),
    },
    new Date(),
    SIG(),
  );
}

const APOLLO: ProviderOutcome = {
  provider: "apollo",
  kind: "ok",
  candidate: { fields: { "person.email": NEW_EMAIL } },
};

async function readPerson(id: string) {
  const [row] = await h.db.select().from(schema.persons).where(eq(schema.persons.id, id));
  return row;
}

// Every person write carries the whole emails array so a primary held only in the column survives
// the re-derivation. That array is validated, so an address the record already held used to fail
// the patch and lock the person out of enrichment entirely, not just out of email enrichment.
describe("applyEnrichment on a person holding a broken address", () => {
  it("writes an unrelated field even though the stored address is not an address", async () => {
    const orgName = `Company-${uniq()}`;
    const [org] = await h.db
      .insert(schema.organizations)
      .values({ name: orgName, ownerId: admin.id, visibilityLevel: "all" })
      .returning();
    const person = await seedPerson({
      primaryEmail: "broken@",
      emails: [{ label: "work", value: "broken@", primary: true }],
    });
    const run = await seedRun(person.id, [
      { provider: "apollo", kind: "ok", candidate: { fields: { "person.companyName": orgName } } },
    ]);

    const result = await apply(run.id, person.updatedAt, [
      { canonicalKey: "person.companyName", value: orgName },
    ]);
    expect(result.ok).toBe(true);

    const after = await readPerson(person.id);
    expect(after?.orgId).toBe(org?.id);
    // The address it could not vouch for is still there. Enrichment does not delete what it
    // cannot validate.
    expect(after?.emails.map((e) => e.value)).toEqual(["broken@"]);
  });

  it("still refuses an address the run itself is introducing when it is not an address", async () => {
    const person = await seedPerson({});
    const run = await seedRun(person.id, [
      { provider: "apollo", kind: "ok", candidate: { fields: { "person.email": "also-broken@" } } },
    ]);

    const result = await apply(run.id, person.updatedAt, [
      { canonicalKey: "person.email", value: "also-broken@" },
    ]);
    expect(result.ok).toBe(false);
  });
});

describe("applyEnrichment promoting an address", () => {
  it("makes the enriched address the primary and keeps the broken one", async () => {
    const person = await seedPerson({
      primaryEmail: "broken@",
      emails: [{ label: "work", value: "broken@", primary: true }],
    });
    const run = await seedRun(person.id, [APOLLO]);

    const result = await apply(run.id, person.updatedAt, [
      { canonicalKey: "person.email", value: NEW_EMAIL, makePrimary: true },
    ]);
    expect(result.ok).toBe(true);

    const after = await readPerson(person.id);
    expect(after?.primaryEmail).toBe(NEW_EMAIL);
    expect(after?.emails.map((e) => e.value)).toEqual(["broken@", NEW_EMAIL]);
  });

  it("leaves the primary alone when the address is only added alongside", async () => {
    const person = await seedPerson({
      primaryEmail: "old@company.com",
      emails: [{ label: "work", value: "old@company.com", primary: true }],
    });
    const run = await seedRun(person.id, [APOLLO]);

    const result = await apply(run.id, person.updatedAt, [
      { canonicalKey: "person.email", value: NEW_EMAIL },
    ]);
    expect(result.ok).toBe(true);

    const after = await readPerson(person.id);
    expect(after?.primaryEmail).toBe("old@company.com");
    expect(after?.emails.map((e) => e.value)).toEqual(["old@company.com", NEW_EMAIL]);
  });

  it("logs the displaced address as the value the promotion replaced", async () => {
    const person = await seedPerson({
      primaryEmail: "broken@",
      emails: [{ label: "work", value: "broken@", primary: true }],
    });
    const run = await seedRun(person.id, [APOLLO]);

    await apply(run.id, person.updatedAt, [
      { canonicalKey: "person.email", value: NEW_EMAIL, makePrimary: true },
    ]);

    const [logged] = await h.db
      .select()
      .from(schema.changeLogs)
      .where(
        and(eq(schema.changeLogs.entityId, person.id), eq(schema.changeLogs.field, "person.email")),
      );
    expect(logged?.oldValue).toEqual("broken@");
    expect(logged?.newValue).toEqual({ value: NEW_EMAIL, providers: ["apollo"] });
  });

  // A plain add replaced nothing, so naming a previous value would make the timeline read as if
  // the address the person still holds had been taken away.
  it("names no previous value for a plain add", async () => {
    const person = await seedPerson({
      primaryEmail: "old@company.com",
      emails: [{ label: "work", value: "old@company.com", primary: true }],
    });
    const run = await seedRun(person.id, [APOLLO]);

    await apply(run.id, person.updatedAt, [{ canonicalKey: "person.email", value: NEW_EMAIL }]);

    const [logged] = await h.db
      .select()
      .from(schema.changeLogs)
      .where(
        and(eq(schema.changeLogs.entityId, person.id), eq(schema.changeLogs.field, "person.email")),
      );
    expect(logged?.oldValue).toBeNull();
  });
});
