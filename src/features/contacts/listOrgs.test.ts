import { isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { deals, organizations, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
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

// Seed an org directly so the test controls owner + visibility.
async function seedOrg(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  opts: { name: string; ownerId: string; visibilityLevel: "owner" | "group" | "all" },
): Promise<void> {
  await db.insert(organizations).values({
    name: opts.name,
    ownerId: opts.ownerId,
    visibilityLevel: opts.visibilityLevel,
    visibilityGroupId: null,
    customFields: {},
  });
}

describe("listOrgs", () => {
  it("returns only orgs the actor can see, sorted by name, with a visible-count total", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const me = await seedUser(db);
      const other = await seedUser(db);

      await seedOrg(db, { name: "Acme", ownerId: me.id, visibilityLevel: "owner" }); // mine
      await seedOrg(db, { name: "Boeing", ownerId: other.id, visibilityLevel: "all" }); // public
      await seedOrg(db, { name: "Zeta", ownerId: other.id, visibilityLevel: "owner" }); // hidden

      const res = await listOrgs(db, regularActor(me.id), { offset: 0, limit: 50 }, signal);

      expect(res.total).toBe(2);
      expect(res.rows.map((r) => r.name)).toEqual(["Acme", "Boeing"]);
    });
  });

  it("pages same-name records across a boundary with a stable tiebreaker (no dup, no skip)", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const me = await seedUser(db);

      // Four orgs sharing one name straddle the page boundary. Explicit ids inserted in
      // reverse-id order so physical order differs from id order: without an id tiebreaker,
      // the two independent page queries lack a stable order among equal names.
      const ids = [
        "00000000-0000-0000-0000-0000000000b1",
        "00000000-0000-0000-0000-0000000000b2",
        "00000000-0000-0000-0000-0000000000b3",
        "00000000-0000-0000-0000-0000000000b4",
      ];
      for (const id of [...ids].reverse()) {
        await db.insert(organizations).values({
          id,
          name: "Same Org",
          ownerId: me.id,
          visibilityLevel: "all",
          visibilityGroupId: null,
          customFields: {},
        });
      }

      const page1 = await listOrgs(db, regularActor(me.id), { offset: 0, limit: 2 }, signal);
      const page2 = await listOrgs(db, regularActor(me.id), { offset: 2, limit: 2 }, signal);
      const seen = [...page1.rows, ...page2.rows].map((r) => r.id);

      expect(seen).toEqual(ids);
      expect(new Set(seen).size).toBe(ids.length);
    });
  });

  it("excludes soft-deleted orgs and paginates the visible set", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const me = await seedUser(db);
      await seedOrg(db, { name: "Gone", ownerId: me.id, visibilityLevel: "all" });
      await db
        .update(organizations)
        .set({ deletedAt: new Date() })
        .where(isNull(organizations.deletedAt));
      await seedOrg(db, { name: "Anna Co", ownerId: me.id, visibilityLevel: "all" });
      await seedOrg(db, { name: "Bravo Co", ownerId: me.id, visibilityLevel: "all" });

      const page1 = await listOrgs(db, regularActor(me.id), { offset: 0, limit: 1 }, signal);
      expect(page1.rows.map((r) => r.name)).toEqual(["Anna Co"]);
      expect(page1.total).toBe(2);
    });
  });

  // The Organizations list's sortable Name header (Task 20). Descending is the case the
  // default (ascending) query would already pass by coincidence, so it's the one worth
  // asserting to actually exercise the ORDER BY direction.
  it("applies a server-side sort when given a sort field/direction", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const me = await seedUser(db);
      await seedOrg(db, { name: "Anna Co", ownerId: me.id, visibilityLevel: "all" });
      await seedOrg(db, { name: "Bravo Co", ownerId: me.id, visibilityLevel: "all" });
      await seedOrg(db, { name: "Cara Co", ownerId: me.id, visibilityLevel: "all" });

      const res = await listOrgs(
        db,
        regularActor(me.id),
        { offset: 0, limit: 50, sort: { field: "name", dir: "desc" } },
        signal,
      );

      expect(res.rows.map((r) => r.name)).toEqual(["Cara Co", "Bravo Co", "Anna Co"]);
    });
  });

  // Task 19: Address / People / Deals columns. Counts must be visibility-gated, not raw
  // COUNTs (a naive COUNT(*) over all people/deals would leak the existence of hidden rows).
  it("returns people and deal counts per org", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const me = await seedUser(db);
      const pipe = await seedPipelineWithStages(db, ["Lead"]);

      const [org] = await db
        .insert(organizations)
        .values({
          name: "O",
          ownerId: me.id,
          visibilityLevel: "all",
          visibilityGroupId: null,
          customFields: {},
        })
        .returning();
      if (org === undefined) throw new Error("setup: org insert failed");

      await db.insert(persons).values([
        { name: "P1", orgId: org.id, ownerId: me.id, visibilityLevel: "all" },
        { name: "P2", orgId: org.id, ownerId: me.id, visibilityLevel: "all" },
      ]);

      await db.insert(deals).values({
        title: "Deal 1",
        orgId: org.id,
        pipelineId: pipe.pipeline.id,
        stageId: pipe.stages[0]!.id,
        ownerId: me.id,
        visibilityLevel: "all",
      });

      const res = await listOrgs(db, regularActor(me.id), { offset: 0, limit: 50 }, signal);
      const row = res.rows.find((r) => r.name === "O");

      expect(row?.peopleCount).toBe(2);
      expect(row?.openDeals).toBe(1);
      expect(row?.closedDeals).toBe(0);
    });
  });

  it("excludes people and deals hidden from the actor by visibility level from the counts", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const me = await seedUser(db);
      const other = await seedUser(db);
      const pipe = await seedPipelineWithStages(db, ["Lead"]);

      const [org] = await db
        .insert(organizations)
        .values({
          name: "O",
          ownerId: me.id,
          visibilityLevel: "all",
          visibilityGroupId: null,
          customFields: {},
        })
        .returning();
      if (org === undefined) throw new Error("setup: org insert failed");

      // Visible to me (owner); the other person is owner-only and owned by someone else.
      await db.insert(persons).values([
        { name: "Mine", orgId: org.id, ownerId: me.id, visibilityLevel: "owner" },
        { name: "Theirs", orgId: org.id, ownerId: other.id, visibilityLevel: "owner" },
      ]);

      await db.insert(deals).values([
        {
          title: "Mine",
          orgId: org.id,
          pipelineId: pipe.pipeline.id,
          stageId: pipe.stages[0]!.id,
          ownerId: me.id,
          visibilityLevel: "owner",
        },
        {
          title: "Theirs",
          orgId: org.id,
          pipelineId: pipe.pipeline.id,
          stageId: pipe.stages[0]!.id,
          ownerId: other.id,
          visibilityLevel: "owner",
        },
      ]);

      const res = await listOrgs(db, regularActor(me.id), { offset: 0, limit: 50 }, signal);
      const row = res.rows.find((r) => r.name === "O");

      expect(row?.peopleCount).toBe(1);
      expect(row?.openDeals).toBe(1);
      expect(row?.closedDeals).toBe(0);
    });
  });
});
