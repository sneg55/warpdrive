import { describe, expect, it } from "vitest";
import type { FilterOpKey } from "@/constants/filterOps";
import { leads } from "@/db/schema/leads";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { LeadFilterField } from "./leadFilterFields";
import { listLeads } from "./leadRepo";

// leads.labels is a text[] of label names, so "is" / "is not" compile to a case-insensitive
// membership test. A lead with no labels lands on the "is not" side of every name.

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

async function insertLead(
  db: TestDb,
  ownerId: string,
  title: string,
  labels: string[],
): Promise<void> {
  await db.insert(leads).values({ title, ownerId, visibilityLevel: "all", labels });
}

function labelListArgs(op: "eq" | "neq", value: string) {
  return {
    filter: "inbox" as const,
    offset: 0,
    limit: 100,
    sort: { field: "createdAt" as const, dir: "desc" as const },
    filters: {
      condition: {
        combinator: "and" as const,
        conditions: [{ field: "labels" as const, op, value }],
      },
    },
  };
}

describe("listLeads filtered by the labels array column", () => {
  async function seedThree(db: TestDb, ownerId: string): Promise<void> {
    await insertLead(db, ownerId, "Hot lead", ["hot"]);
    await insertLead(db, ownerId, "Cold lead", ["cold"]);
    await insertLead(db, ownerId, "Plain lead", []);
  }

  it("matches only the lead carrying the key on eq", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedThree(db, me.id);

      const res = await listLeads(db, visSession(me.id), labelListArgs("eq", "hot"), sig());
      expect(res.rows.map((r) => r.title)).toEqual(["Hot lead"]);
      expect(res.total).toBe(1);
    });
  });

  it("keeps the differently labelled and the unlabelled lead on neq", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedThree(db, me.id);

      const res = await listLeads(db, visSession(me.id), labelListArgs("neq", "hot"), sig());
      expect(res.rows.map((r) => r.title).sort()).toEqual(["Cold lead", "Plain lead"]);
    });
  });

  // A migrated install can still hold legacy lowercase values in leads.labels while the picker
  // offers the catalog's cased name, so matching has to ignore case on both sides.
  it("matches a legacy lowercase label value against the cased name the picker offers", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedThree(db, me.id);

      const hot = await listLeads(db, visSession(me.id), labelListArgs("eq", "Hot"), sig());
      expect(hot.rows.map((r) => r.title)).toEqual(["Hot lead"]);

      const notHot = await listLeads(db, visSession(me.id), labelListArgs("neq", "Hot"), sig());
      expect(notHot.rows.map((r) => r.title).sort()).toEqual(["Cold lead", "Plain lead"]);
    });
  });

  it("matches a lead carrying the key alongside other labels", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await insertLead(db, me.id, "Multi lead", ["warm", "hot"]);

      const res = await listLeads(db, visSession(me.id), labelListArgs("eq", "hot"), sig());
      expect(res.rows.map((r) => r.title)).toEqual(["Multi lead"]);
    });
  });

  it("matches an empty labels array on isEmpty and a populated one on isNotEmpty", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedThree(db, me.id);

      const empty = await listLeads(db, visSession(me.id), opListArgs("labels", "isEmpty"), sig());
      expect(empty.rows.map((r) => r.title)).toEqual(["Plain lead"]);

      const filled = await listLeads(
        db,
        visSession(me.id),
        opListArgs("labels", "isNotEmpty"),
        sig(),
      );
      expect(filled.rows.map((r) => r.title).sort()).toEqual(["Cold lead", "Hot lead"]);
    });
  });
});

function opListArgs(field: LeadFilterField, op: FilterOpKey, value: string | number = "") {
  return {
    filter: "inbox" as const,
    offset: 0,
    limit: 100,
    sort: { field: "createdAt" as const, dir: "desc" as const },
    filters: { condition: { combinator: "and" as const, conditions: [{ field, op, value }] } },
  };
}

// The tier 2 operators live or die on null handling, which only a real Postgres settles: `<>` and a
// bare NOT ILIKE both evaluate to NULL against a NULL column, silently dropping the row. leads.value
// is the nullable column here; title and sourceOrigin are NOT NULL, so they carry the blank case.
describe("listLeads with the tier 2 operators", () => {
  async function seedValues(db: TestDb, ownerId: string): Promise<void> {
    await db.insert(leads).values([
      { title: "Priced lead", ownerId, visibilityLevel: "all", value: "500.00" },
      { title: "Unpriced lead", ownerId, visibilityLevel: "all", value: null },
      { title: "", ownerId, visibilityLevel: "all", value: null },
    ]);
  }

  async function titles(db: TestDb, ownerId: string, a: ReturnType<typeof opListArgs>) {
    const res = await listLeads(db, visSession(ownerId), a, sig());
    return res.rows.map((r) => r.title).sort();
  }

  it("returns the NULL-value lead on neq", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedValues(db, me.id);
      expect(await titles(db, me.id, opListArgs("value", "neq", 500))).toEqual([
        "",
        "Unpriced lead",
      ]);
    });
  });

  it("matches a NULL value on isEmpty and only the priced lead on isNotEmpty", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedValues(db, me.id);
      expect(await titles(db, me.id, opListArgs("value", "isEmpty"))).toEqual([
        "",
        "Unpriced lead",
      ]);
      expect(await titles(db, me.id, opListArgs("value", "isNotEmpty"))).toEqual(["Priced lead"]);
    });
  });

  it("keeps the blank-title lead on notContains and finds it on isEmpty", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedValues(db, me.id);
      expect(await titles(db, me.id, opListArgs("title", "notContains", "priced"))).toEqual([""]);
      expect(await titles(db, me.id, opListArgs("title", "isEmpty"))).toEqual([""]);
    });
  });

  it("matches a prefix on startsWith and not a mid-string occurrence", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedValues(db, me.id);
      expect(await titles(db, me.id, opListArgs("title", "startsWith", "Priced"))).toEqual([
        "Priced lead",
      ]);
      expect(await titles(db, me.id, opListArgs("title", "startsWith", "lead"))).toEqual([]);
      expect(await titles(db, me.id, opListArgs("title", "contains", "lead"))).toEqual([
        "Priced lead",
        "Unpriced lead",
      ]);
    });
  });
});
