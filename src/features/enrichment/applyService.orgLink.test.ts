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

async function seedPerson(values: Partial<typeof schema.persons.$inferInsert> = {}) {
  const [row] = await h.db
    .insert(schema.persons)
    .values({
      name: `Pat-${Math.random().toString(36).slice(2)}`,
      ownerId: admin.id,
      visibilityLevel: "all",
      ...values,
    })
    .returning();
  if (row === undefined) throw new Error("no person row");
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

describe("applyEnrichment organization linking", () => {
  it("links the organization matching the candidate domain over a same-name one", async () => {
    // Both sides carry the shapes people actually store: a pasted URL here, a bare host there.
    const byDomain = await seedOrg({
      name: "Initech Holdings",
      domain: "https://www.Initech.com/",
    });
    await seedOrg({ name: "Initech" });
    const person = await seedPerson();
    const run = await seedRun("person", person.id, [
      APOLLO({ "person.companyName": "Initech", "person.companyDomain": "initech.com" }),
    ]);

    const result = await apply(run.id, person.updatedAt, [
      { canonicalKey: "person.companyName", value: "Initech" },
    ]);

    expect(result.ok).toBe(true);
    const [after] = await h.db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.id, person.id));
    expect(after?.orgId).toBe(byDomain.id);
  });

  // The domain outranks the name in matching, so a domain taken from the provider the user did
  // NOT pick links the person to the wrong company, silently and with no sign in the dialog.
  it("ignores a domain reported by a provider whose company the user did not pick", async () => {
    await seedOrg({ name: "Acme Systems", domain: "acme.com" });
    const chosen = await seedOrg({ name: "Beta Works" });
    const person = await seedPerson();
    const run = await seedRun("person", person.id, [
      APOLLO({ "person.companyName": "Acme Systems", "person.companyDomain": "acme.com" }),
      {
        provider: "rocketreach",
        kind: "ok",
        candidate: { fields: { "person.companyName": "Beta Works" } },
      },
    ]);

    const result = await apply(run.id, person.updatedAt, [
      { canonicalKey: "person.companyName", value: "Beta Works" },
    ]);

    expect(result.ok).toBe(true);
    const [after] = await h.db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.id, person.id));
    expect(after?.orgId).toBe(chosen.id);
  });

  // Domain outranks name, so taking the first of two disagreeing domains picks a company the user
  // never chose. Disagreement has to fall back to the name.
  it("ignores the domain when providers agree on the name but not the domain", async () => {
    await seedOrg({ name: "Globex Systems", domain: "globex.io" });
    const byName = await seedOrg({ name: "Globex" });
    const person = await seedPerson();
    const run = await seedRun("person", person.id, [
      APOLLO({ "person.companyName": "Globex", "person.companyDomain": "globex.io" }),
      {
        provider: "rocketreach",
        kind: "ok",
        candidate: {
          fields: { "person.companyName": "Globex", "person.companyDomain": "globex.net" },
        },
      },
    ]);

    const result = await apply(run.id, person.updatedAt, [
      { canonicalKey: "person.companyName", value: "Globex" },
    ]);

    expect(result.ok).toBe(true);
    const [after] = await h.db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.id, person.id));
    expect(after?.orgId).toBe(byName.id);
  });

  it("still uses a domain the providers agree on, spelled differently", async () => {
    const byDomain = await seedOrg({ name: "Soylent Holdings", domain: "soylent.com" });
    await seedOrg({ name: "Soylent" });
    const person = await seedPerson();
    const run = await seedRun("person", person.id, [
      APOLLO({ "person.companyName": "Soylent", "person.companyDomain": "soylent.com" }),
      {
        provider: "rocketreach",
        kind: "ok",
        candidate: {
          fields: { "person.companyName": "Soylent", "person.companyDomain": "www.soylent.com" },
        },
      },
    ]);

    await apply(run.id, person.updatedAt, [
      { canonicalKey: "person.companyName", value: "Soylent" },
    ]);

    const [after] = await h.db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.id, person.id));
    expect(after?.orgId).toBe(byDomain.id);
  });

  // Returning a hidden organization's id only makes updatePerson reject the reference and fail the
  // whole transaction, so the other selected fields would be lost too.
  it("reports the company as unresolved rather than linking one the actor cannot see", async () => {
    const stranger = await seedUser(h);
    await seedOrg({ name: "Umbrella Corp", ownerId: admin.id, visibilityLevel: "owner" });
    const [person] = await h.db
      .insert(schema.persons)
      .values({
        name: `Pat-${Math.random().toString(36).slice(2)}`,
        ownerId: stranger.id,
        visibilityLevel: "all",
      })
      .returning();
    if (person === undefined) throw new Error("no person row");
    const run = await seedRun("person", person.id, [
      APOLLO({ "person.companyName": "Umbrella Corp" }),
    ]);

    const result = await apply(
      run.id,
      person.updatedAt,
      [{ canonicalKey: "person.companyName", value: "Umbrella Corp" }],
      stranger,
      ["contact.edit_own"],
    );

    expect(result.ok && result.value.unresolved).toEqual(["person.companyName"]);
    const [after] = await h.db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.id, person.id));
    expect(after?.orgId).toBeNull();
  });

  // A different spelling of the company already linked resolves back to the same organization.
  // Counting it as applied moves updatedAt and writes a change-log row for a link nobody can see
  // change, and the cached run keeps proposing it.
  it("does not count a company name that resolves to the organization already linked", async () => {
    const org = await seedOrg({ name: "Vandelay Holdings", domain: "vandelay.test" });
    const person = await seedPerson({ orgId: org.id });
    const run = await seedRun("person", person.id, [
      APOLLO({ "person.companyName": "Vandelay", "person.companyDomain": "vandelay.test" }),
    ]);

    const result = await apply(run.id, person.updatedAt, [
      { canonicalKey: "person.companyName", value: "Vandelay" },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedFields).toEqual([]);
    expect(result.value.unresolved).toEqual([]);
    const [after] = await h.db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.id, person.id));
    expect(after?.orgId).toBe(org.id);
    expect(after?.updatedAt.toISOString()).toBe(person.updatedAt.toISOString());
  });

  it("reports an organization it could not link instead of dropping it silently", async () => {
    await seedOrg({ name: "Dupe Corp" });
    await seedOrg({ name: "Dupe Corp" });
    const person = await seedPerson();
    const run = await seedRun("person", person.id, [APOLLO({ "person.companyName": "Dupe Corp" })]);

    const result = await apply(run.id, person.updatedAt, [
      { canonicalKey: "person.companyName", value: "Dupe Corp" },
    ]);

    expect(result.ok && result.value.appliedFields).toEqual([]);
    expect(result.ok && result.value.unresolved).toEqual(["person.companyName"]);
    const [after] = await h.db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.id, person.id));
    expect(after?.orgId).toBeNull();
  });

  // An apply that names no field is a client bug, not a no-op: letting it through stamped the run
  // as applied while nothing was written. See applyService.auth.test.ts.
  it("rejects an empty selection", async () => {
    const org = await seedOrg();
    const run = await seedRun("organization", org.id, [APOLLO({ "org.industry": "Energy" })]);

    const result = await apply(run.id, org.updatedAt, []);
    expect(result.ok).toBe(false);
  });
});
