import { describe, expect, it } from "vitest";
import { organizations, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { ContactFilterOp } from "./contactFilterConfig";
import { listPeople } from "./listPeople";
import { listOrgs } from "./orgsRepo";
import type { ContactActor } from "./personsRepo";

// The tier 2 operators live or die on null handling, which only a real Postgres settles: `<>` and a
// bare NOT ILIKE both evaluate to NULL against a NULL column, silently dropping the row.

function regularActor(id: string): ContactActor {
  return {
    id,
    type: "regular",
    isActive: true,
    groupIds: new Set(),
    flags: new Set(),
    primaryVisibilityGroupId: null,
  };
}

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const sig = () => new AbortController().signal;

async function seedPerson(
  db: TestDb,
  opts: { name: string; ownerId: string; email: string | null; labels: string[] },
): Promise<void> {
  await db.insert(persons).values({
    name: opts.name,
    primaryEmail: opts.email,
    emails: [],
    phones: [],
    orgId: null,
    ownerId: opts.ownerId,
    visibilityLevel: "all",
    visibilityGroupId: null,
    customFields: {},
    labels: opts.labels,
  });
}

function args(field: string, op: ContactFilterOp, value?: string | number) {
  return {
    offset: 0,
    limit: 50,
    filter: { combinator: "and" as const, conditions: [{ field, op, value }] },
  };
}

describe("listPeople with the tier 2 operators", () => {
  async function seedNullMatrix(db: TestDb, ownerId: string): Promise<void> {
    await seedPerson(db, { name: "Ann Alpha", ownerId, email: "ann@acme.com", labels: ["hot"] });
    await seedPerson(db, { name: "Bob Beta", ownerId, email: null, labels: [] });
    await seedPerson(db, { name: "Cy Gamma", ownerId, email: "", labels: [] });
  }

  async function names(db: TestDb, ownerId: string, a: ReturnType<typeof args>): Promise<string[]> {
    const res = await listPeople(db, regularActor(ownerId), a, sig());
    return res.rows.map((r) => r.name).sort();
  }

  it("returns the NULL-email person on neq", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedNullMatrix(db, me.id);
      expect(await names(db, me.id, args("primaryEmail", "neq", "ann@acme.com"))).toEqual([
        "Bob Beta",
        "Cy Gamma",
      ]);
    });
  });

  it("returns the NULL-email person on notContains", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedNullMatrix(db, me.id);
      expect(await names(db, me.id, args("primaryEmail", "notContains", "acme"))).toEqual([
        "Bob Beta",
        "Cy Gamma",
      ]);
    });
  });

  it("matches NULL and empty-string on isEmpty, only the populated one on isNotEmpty", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedNullMatrix(db, me.id);
      expect(await names(db, me.id, args("primaryEmail", "isEmpty"))).toEqual([
        "Bob Beta",
        "Cy Gamma",
      ]);
      expect(await names(db, me.id, args("primaryEmail", "isNotEmpty"))).toEqual(["Ann Alpha"]);
    });
  });

  it("matches a prefix on startsWith and not a mid-string occurrence", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedNullMatrix(db, me.id);
      expect(await names(db, me.id, args("primaryEmail", "startsWith", "ann"))).toEqual([
        "Ann Alpha",
      ]);
      expect(await names(db, me.id, args("primaryEmail", "startsWith", "acme"))).toEqual([]);
      expect(await names(db, me.id, args("primaryEmail", "contains", "acme"))).toEqual([
        "Ann Alpha",
      ]);
    });
  });

  it("matches an empty labels array on isEmpty and a populated one on isNotEmpty", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedNullMatrix(db, me.id);
      expect(await names(db, me.id, args("labels", "isEmpty"))).toEqual(["Bob Beta", "Cy Gamma"]);
      expect(await names(db, me.id, args("labels", "isNotEmpty"))).toEqual(["Ann Alpha"]);
    });
  });
});

describe("listOrgs with the tier 2 operators", () => {
  it("keeps the NULL-column org on isEmpty, neq, and notContains", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const base = {
        ownerId: me.id,
        visibilityLevel: "all" as const,
        visibilityGroupId: null,
        customFields: {},
      };
      await db.insert(organizations).values([
        { ...base, name: "Known Co", industry: "Software", employeeCount: 5 },
        { ...base, name: "Unknown Co", industry: null, employeeCount: null },
      ]);

      const run = async (a: ReturnType<typeof args>): Promise<string[]> => {
        const res = await listOrgs(db, regularActor(me.id), a, sig());
        return res.rows.map((r) => r.name).sort();
      };
      expect(await run(args("employeeCount", "isEmpty"))).toEqual(["Unknown Co"]);
      expect(await run(args("employeeCount", "isNotEmpty"))).toEqual(["Known Co"]);
      expect(await run(args("employeeCount", "neq", 5))).toEqual(["Unknown Co"]);
      expect(await run(args("industry", "notContains", "soft"))).toEqual(["Unknown Co"]);
      expect(await run(args("industry", "startsWith", "Soft"))).toEqual(["Known Co"]);
    });
  });
});
