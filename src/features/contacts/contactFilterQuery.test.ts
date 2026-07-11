import { describe, expect, it } from "vitest";
import { organizations, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { listPeople } from "./listPeople";
import { listOrgs } from "./orgsRepo";
import type { ContactActor } from "./personsRepo";

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

async function seedPerson(
  db: TestDb,
  opts: { name: string; ownerId: string; visibilityLevel: "owner" | "group" | "all" },
): Promise<void> {
  const email = `${opts.name.toLowerCase()}@example.com`;
  await db.insert(persons).values({
    name: opts.name,
    primaryEmail: email,
    emails: [{ label: "work", value: email, primary: true }],
    phones: [],
    orgId: null,
    ownerId: opts.ownerId,
    visibilityLevel: opts.visibilityLevel,
    visibilityGroupId: null,
    customFields: {},
  });
}

async function seedOrg(
  db: TestDb,
  opts: { name: string; ownerId: string; industry: string | null; employeeCount: number | null },
): Promise<void> {
  await db.insert(organizations).values({
    name: opts.name,
    industry: opts.industry,
    employeeCount: opts.employeeCount,
    ownerId: opts.ownerId,
    visibilityLevel: "all",
    visibilityGroupId: null,
    customFields: {},
  });
}

describe("listPeople with a condition filter", () => {
  it("filters by name contains (case-insensitive ILIKE)", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const me = await seedUser(db);
      await seedPerson(db, { name: "Acme Anna", ownerId: me.id, visibilityLevel: "all" });
      await seedPerson(db, { name: "Beta Bob", ownerId: me.id, visibilityLevel: "all" });

      const res = await listPeople(
        db,
        regularActor(me.id),
        {
          offset: 0,
          limit: 50,
          filter: {
            combinator: "and",
            conditions: [{ field: "name", op: "contains", value: "acme" }],
          },
        },
        signal,
      );
      expect(res.rows.map((r) => r.name)).toEqual(["Acme Anna"]);
      expect(res.total).toBe(1);
    });
  });

  it("filters by ownerId eq", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const me = await seedUser(db);
      const other = await seedUser(db);
      await seedPerson(db, { name: "Mine", ownerId: me.id, visibilityLevel: "all" });
      await seedPerson(db, { name: "Theirs", ownerId: other.id, visibilityLevel: "all" });

      const res = await listPeople(
        db,
        regularActor(me.id),
        {
          offset: 0,
          limit: 50,
          filter: {
            combinator: "and",
            conditions: [{ field: "ownerId", op: "eq", value: other.id }],
          },
        },
        signal,
      );
      expect(res.rows.map((r) => r.name)).toEqual(["Theirs"]);
    });
  });

  it("never leaks a filter-matched but hidden person (filter ANDs before visibility)", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const me = await seedUser(db);
      const other = await seedUser(db);
      // Matches the name filter but is owner-private to someone else: must NOT appear.
      await seedPerson(db, { name: "Secret Sam", ownerId: other.id, visibilityLevel: "owner" });

      const res = await listPeople(
        db,
        regularActor(me.id),
        {
          offset: 0,
          limit: 50,
          filter: {
            combinator: "and",
            conditions: [{ field: "name", op: "contains", value: "secret" }],
          },
        },
        signal,
      );
      expect(res.total).toBe(0);
      expect(res.rows).toEqual([]);
    });
  });
});

describe("listOrgs with a condition filter", () => {
  it("filters by industry contains and employeeCount gt (AND)", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const me = await seedUser(db);
      await seedOrg(db, {
        name: "BigSaaS",
        ownerId: me.id,
        industry: "Software",
        employeeCount: 500,
      });
      await seedOrg(db, {
        name: "SmallSaaS",
        ownerId: me.id,
        industry: "Software",
        employeeCount: 10,
      });
      await seedOrg(db, {
        name: "BigManuf",
        ownerId: me.id,
        industry: "Manufacturing",
        employeeCount: 900,
      });

      const res = await listOrgs(
        db,
        regularActor(me.id),
        {
          offset: 0,
          limit: 50,
          filter: {
            combinator: "and",
            conditions: [
              { field: "industry", op: "contains", value: "software" },
              { field: "employeeCount", op: "gt", value: 100 },
            ],
          },
        },
        signal,
      );
      expect(res.rows.map((r) => r.name)).toEqual(["BigSaaS"]);
    });
  });

  it("supports the OR combinator", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const me = await seedUser(db);
      await seedOrg(db, { name: "Alpha", ownerId: me.id, industry: "Retail", employeeCount: 5 });
      await seedOrg(db, { name: "Beta", ownerId: me.id, industry: "Finance", employeeCount: 5 });
      await seedOrg(db, { name: "Gamma", ownerId: me.id, industry: "Health", employeeCount: 5 });

      const res = await listOrgs(
        db,
        regularActor(me.id),
        {
          offset: 0,
          limit: 50,
          filter: {
            combinator: "or",
            conditions: [
              { field: "name", op: "eq", value: "Alpha" },
              { field: "name", op: "eq", value: "Gamma" },
            ],
          },
        },
        signal,
      );
      expect(res.rows.map((r) => r.name).sort()).toEqual(["Alpha", "Gamma"]);
    });
  });
});
