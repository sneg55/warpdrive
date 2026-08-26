// "or" widens the leads list and "and" narrows it. Only real Postgres proves the fold, since a
// mocked query would happily return whatever the fixture said regardless of the operator.
import { describe, expect, it } from "vitest";
import { leads } from "@/db/schema/leads";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { listLeads } from "./leadRepo";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const sig = () => new AbortController().signal;

function visSession(userId: string) {
  return {
    userId,
    isAdmin: false,
    isActive: true,
    sessionLive: true,
    visibilityGroupIds: [] as string[],
    managedUserIds: [] as string[],
  };
}

function listArgs(combinator: "and" | "or") {
  return {
    filter: "inbox" as const,
    offset: 0,
    limit: 100,
    sort: { field: "createdAt" as const, dir: "desc" as const },
    filters: {
      condition: {
        combinator,
        conditions: [
          { field: "title" as const, op: "contains" as const, value: "acme" },
          { field: "value" as const, op: "gt" as const, value: 100 },
        ],
      },
    },
  };
}

async function seedThree(db: TestDb, ownerId: string): Promise<void> {
  const rows: Array<[string, string]> = [
    ["Acme small", "10"],
    ["Acme big", "500"],
    ["Globex big", "500"],
  ];
  for (const [title, value] of rows) {
    await db.insert(leads).values({ title, value, ownerId, visibilityLevel: "all", labels: [] });
  }
}

describe("listLeads with a filter combinator", () => {
  it("or returns the union of the two conditions", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedThree(db, me.id);
      const res = await listLeads(db, visSession(me.id), listArgs("or"), sig());
      expect(res.rows.map((r) => r.title).sort()).toEqual(["Acme big", "Acme small", "Globex big"]);
    });
  });

  it("and returns the intersection of the two conditions", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedThree(db, me.id);
      const res = await listLeads(db, visSession(me.id), listArgs("and"), sig());
      expect(res.rows.map((r) => r.title)).toEqual(["Acme big"]);
    });
  });
});

// "is any of": the names travel as one bound text[], so only a real server proves the cast and the
// case-insensitive comparison hold together.
describe("listLeads with a multi-value labels condition", () => {
  function labelArgs(op: "eq" | "neq", value: string[]) {
    return {
      filter: "inbox" as const,
      offset: 0,
      limit: 100,
      sort: { field: "createdAt" as const, dir: "desc" as const },
      filters: {
        condition: { combinator: "or" as const, conditions: [{ field: "labels", op, value }] },
      },
    };
  }

  async function seedLabelled(db: TestDb, ownerId: string): Promise<void> {
    // "hot" is stored lowercase the way the label backfill leaves a legacy value.
    const rows: Array<[string, string[]]> = [
      ["Hot lead", ["hot"]],
      ["Warm lead", ["Warm"]],
      ["Cold lead", ["Cold"]],
      ["Plain lead", []],
    ];
    for (const [title, labels] of rows) {
      await db.insert(leads).values({ title, ownerId, visibilityLevel: "all", labels });
    }
  }

  it("eq matches a lead carrying either name, legacy lowercase included", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedLabelled(db, me.id);
      const res = await listLeads(db, visSession(me.id), labelArgs("eq", ["Hot", "Warm"]), sig());
      expect(res.rows.map((r) => r.title).sort()).toEqual(["Hot lead", "Warm lead"]);
    });
  });

  it("neq excludes a lead carrying either name and keeps the unlabelled one", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedLabelled(db, me.id);
      const res = await listLeads(db, visSession(me.id), labelArgs("neq", ["Hot", "Warm"]), sig());
      expect(res.rows.map((r) => r.title).sort()).toEqual(["Cold lead", "Plain lead"]);
    });
  });
});
