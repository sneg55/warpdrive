import { describe, expect, it } from "vitest";
import { organizations, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { listPeople } from "./listPeople";
import { listOrgs } from "./orgsRepo";
import type { ContactActor } from "./personsRepo";

// persons.labels / organizations.labels are text[] of label names, so "is" / "is not" compile to a
// case-insensitive membership test. A row with no labels lands on the "is not" side of every name.

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
  opts: { name: string; ownerId: string; labels: string[] },
): Promise<void> {
  const email = `${opts.name.toLowerCase().replace(/\s+/g, ".")}@example.com`;
  await db.insert(persons).values({
    name: opts.name,
    primaryEmail: email,
    emails: [{ label: "work", value: email, primary: true }],
    phones: [],
    orgId: null,
    ownerId: opts.ownerId,
    visibilityLevel: "all",
    visibilityGroupId: null,
    customFields: {},
    labels: opts.labels,
  });
}

async function seedOrg(
  db: TestDb,
  opts: { name: string; ownerId: string; labels: string[] },
): Promise<void> {
  await db.insert(organizations).values({
    name: opts.name,
    industry: null,
    employeeCount: null,
    ownerId: opts.ownerId,
    visibilityLevel: "all",
    visibilityGroupId: null,
    customFields: {},
    labels: opts.labels,
  });
}

function labelFilter(op: "eq" | "neq", value: string) {
  return {
    offset: 0,
    limit: 50,
    filter: {
      combinator: "and" as const,
      conditions: [{ field: "labels", op, value }],
    },
  };
}

describe("listPeople filtered by the labels array column", () => {
  async function seedThree(db: TestDb, ownerId: string): Promise<void> {
    await seedPerson(db, { name: "Hot Hank", ownerId, labels: ["hot"] });
    await seedPerson(db, { name: "Cold Cody", ownerId, labels: ["cold"] });
    await seedPerson(db, { name: "Plain Pat", ownerId, labels: [] });
  }

  it("matches only the person carrying the key on eq", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedThree(db, me.id);

      const res = await listPeople(db, regularActor(me.id), labelFilter("eq", "hot"), sig());
      expect(res.rows.map((r) => r.name)).toEqual(["Hot Hank"]);
      expect(res.total).toBe(1);
    });
  });

  it("keeps the differently labelled and the unlabelled person on neq", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedThree(db, me.id);

      const res = await listPeople(db, regularActor(me.id), labelFilter("neq", "hot"), sig());
      expect(res.rows.map((r) => r.name).sort()).toEqual(["Cold Cody", "Plain Pat"]);
    });
  });

  // A migrated install can still hold legacy lowercase values in persons.labels while the picker
  // offers the catalog's cased name, so matching has to ignore case on both sides.
  it("matches a legacy lowercase label value against the cased name the picker offers", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedThree(db, me.id);

      const hot = await listPeople(db, regularActor(me.id), labelFilter("eq", "Hot"), sig());
      expect(hot.rows.map((r) => r.name)).toEqual(["Hot Hank"]);

      const notHot = await listPeople(db, regularActor(me.id), labelFilter("neq", "Hot"), sig());
      expect(notHot.rows.map((r) => r.name).sort()).toEqual(["Cold Cody", "Plain Pat"]);
    });
  });

  it("matches a person carrying the key alongside other labels", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedPerson(db, { name: "Multi Mo", ownerId: me.id, labels: ["warm", "hot"] });

      const res = await listPeople(db, regularActor(me.id), labelFilter("eq", "hot"), sig());
      expect(res.rows.map((r) => r.name)).toEqual(["Multi Mo"]);
    });
  });
});

// "is any of": the names travel as one bound text[], so only a real server proves the cast and the
// case-insensitive comparison hold together.
describe("listPeople filtered by several label names at once", () => {
  function multiFilter(op: "eq" | "neq", value: string[]) {
    return {
      offset: 0,
      limit: 50,
      filter: { combinator: "or" as const, conditions: [{ field: "labels", op, value }] },
    };
  }

  async function seedFour(db: TestDb, ownerId: string): Promise<void> {
    // "hot" is stored lowercase the way the label backfill leaves a legacy value.
    await seedPerson(db, { name: "Hot Hank", ownerId, labels: ["hot"] });
    await seedPerson(db, { name: "Warm Wanda", ownerId, labels: ["Warm"] });
    await seedPerson(db, { name: "Cold Cody", ownerId, labels: ["Cold"] });
    await seedPerson(db, { name: "Plain Pat", ownerId, labels: [] });
  }

  it("eq matches a person carrying either name, legacy lowercase included", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedFour(db, me.id);
      const res = await listPeople(
        db,
        regularActor(me.id),
        multiFilter("eq", ["Hot", "Warm"]),
        sig(),
      );
      expect(res.rows.map((r) => r.name).sort()).toEqual(["Hot Hank", "Warm Wanda"]);
    });
  });

  it("neq excludes anyone carrying either name and keeps the unlabelled person", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedFour(db, me.id);
      const res = await listPeople(
        db,
        regularActor(me.id),
        multiFilter("neq", ["Hot", "Warm"]),
        sig(),
      );
      expect(res.rows.map((r) => r.name).sort()).toEqual(["Cold Cody", "Plain Pat"]);
    });
  });
});

describe("listOrgs filtered by the labels array column", () => {
  it("matches on eq and keeps the unlabelled org on neq", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedOrg(db, { name: "Hot Co", ownerId: me.id, labels: ["hot"] });
      await seedOrg(db, { name: "Cold Co", ownerId: me.id, labels: ["cold"] });
      await seedOrg(db, { name: "Plain Co", ownerId: me.id, labels: [] });

      const hot = await listOrgs(db, regularActor(me.id), labelFilter("eq", "hot"), sig());
      expect(hot.rows.map((r) => r.name)).toEqual(["Hot Co"]);

      const notHot = await listOrgs(db, regularActor(me.id), labelFilter("neq", "hot"), sig());
      expect(notHot.rows.map((r) => r.name).sort()).toEqual(["Cold Co", "Plain Co"]);
    });
  });
});
