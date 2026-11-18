import { isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { dealParticipants, deals, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createDef } from "@/features/custom-fields/defsRepo";
import { listPeople } from "./listPeople";
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

async function seedPerson(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  opts: {
    name: string;
    ownerId: string;
    visibilityLevel: "owner" | "group" | "all";
    customFields?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(persons).values({
    name: opts.name,
    primaryEmail: `${opts.name.toLowerCase()}@example.com`,
    emails: [{ label: "work", value: `${opts.name.toLowerCase()}@example.com`, primary: true }],
    phones: [],
    orgId: null,
    ownerId: opts.ownerId,
    visibilityLevel: opts.visibilityLevel,
    visibilityGroupId: null,
    customFields: opts.customFields ?? {},
  });
}

describe("listPeople", () => {
  it("returns only people the actor can see, sorted by name, with a visible-count total", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const me = await seedUser(db);
      const other = await seedUser(db);

      await seedPerson(db, { name: "Anna", ownerId: me.id, visibilityLevel: "owner" });
      await seedPerson(db, { name: "Bob", ownerId: other.id, visibilityLevel: "all" });
      await seedPerson(db, { name: "Zoe", ownerId: other.id, visibilityLevel: "owner" });

      const res = await listPeople(db, regularActor(me.id), { offset: 0, limit: 50 }, signal);

      expect(res.total).toBe(2);
      expect(res.rows.map((r) => r.name)).toEqual(["Anna", "Bob"]);
    });
  });

  it("excludes soft-deleted people", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const me = await seedUser(db);
      await seedPerson(db, { name: "Anna", ownerId: me.id, visibilityLevel: "all" });
      await seedPerson(db, { name: "Gone", ownerId: me.id, visibilityLevel: "all" });
      await db.update(persons).set({ deletedAt: new Date() }).where(isNull(persons.deletedAt));
      await seedPerson(db, { name: "Live", ownerId: me.id, visibilityLevel: "all" });

      const res = await listPeople(db, regularActor(me.id), { offset: 0, limit: 50 }, signal);
      expect(res.rows.map((r) => r.name)).toEqual(["Live"]);
      expect(res.total).toBe(1);
    });
  });

  it("pages same-name records across a boundary with a stable tiebreaker (no dup, no skip)", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const me = await seedUser(db);

      const ids = [
        "00000000-0000-0000-0000-0000000000a1",
        "00000000-0000-0000-0000-0000000000a2",
        "00000000-0000-0000-0000-0000000000a3",
        "00000000-0000-0000-0000-0000000000a4",
      ];
      for (const id of [...ids].reverse()) {
        await db.insert(persons).values({
          id,
          name: "Same Name",
          primaryEmail: `${id}@example.com`,
          emails: [],
          phones: [],
          orgId: null,
          ownerId: me.id,
          visibilityLevel: "all",
          visibilityGroupId: null,
          customFields: {},
        });
      }

      const page1 = await listPeople(db, regularActor(me.id), { offset: 0, limit: 2 }, signal);
      const page2 = await listPeople(db, regularActor(me.id), { offset: 2, limit: 2 }, signal);
      const seen = [...page1.rows, ...page2.rows].map((r) => r.id);

      expect(seen).toEqual(ids);
      expect(new Set(seen).size).toBe(ids.length);
    });
  });

  it("paginates the visible set while reporting the full visible total", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const me = await seedUser(db);
      await seedPerson(db, { name: "Anna", ownerId: me.id, visibilityLevel: "all" });
      await seedPerson(db, { name: "Bob", ownerId: me.id, visibilityLevel: "all" });
      await seedPerson(db, { name: "Cara", ownerId: me.id, visibilityLevel: "all" });

      const page1 = await listPeople(db, regularActor(me.id), { offset: 0, limit: 2 }, signal);
      expect(page1.rows.map((r) => r.name)).toEqual(["Anna", "Bob"]);
      expect(page1.total).toBe(3);

      const page2 = await listPeople(db, regularActor(me.id), { offset: 2, limit: 2 }, signal);
      expect(page2.rows.map((r) => r.name)).toEqual(["Cara"]);
      expect(page2.total).toBe(3);
    });
  });

  it("applies a server-side sort when given a sort field/direction", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const me = await seedUser(db);
      await seedPerson(db, { name: "Anna", ownerId: me.id, visibilityLevel: "all" });
      await seedPerson(db, { name: "Bob", ownerId: me.id, visibilityLevel: "all" });
      await seedPerson(db, { name: "Cara", ownerId: me.id, visibilityLevel: "all" });

      const res = await listPeople(
        db,
        regularActor(me.id),
        { offset: 0, limit: 50, sort: { field: "name", dir: "desc" } },
        signal,
      );

      expect(res.rows.map((r) => r.name)).toEqual(["Cara", "Bob", "Anna"]);
    });
  });

  it("returns the count of closed (won+lost) deals per person, via person_id and participants", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const me = await seedUser(db);
      const { pipeline, stages } = await seedPipelineWithStages(db, ["Qualified"]);
      const stageId = stages[0]?.id ?? "";

      const [person] = await db
        .insert(persons)
        .values({
          name: "Deal Owner",
          primaryEmail: "d@example.com",
          emails: [],
          phones: [],
          orgId: null,
          ownerId: me.id,
          visibilityLevel: "all",
          visibilityGroupId: null,
          customFields: {},
        })
        .returning();
      const personId = person?.id ?? "";

      const dealBase = {
        pipelineId: pipeline.id,
        stageId,
        ownerId: me.id,
        visibilityLevel: "all" as const,
      };
      await db.insert(deals).values([
        { ...dealBase, title: "Won A", status: "won", personId },
        { ...dealBase, title: "Lost B", status: "lost", personId },
        { ...dealBase, title: "Open C", status: "open", personId },
      ]);
      const [viaParticipant] = await db
        .insert(deals)
        .values({ ...dealBase, title: "Won D (participant)", status: "won", personId: null })
        .returning();
      await db.insert(dealParticipants).values({ dealId: viaParticipant?.id ?? "", personId });

      const res = await listPeople(db, regularActor(me.id), { offset: 0, limit: 50 }, signal);
      const row = res.rows.find((r) => r.id === personId);
      expect(row?.closedDeals).toBe(3);
    });
  });

  it("applies a server-side sort on primaryEmail", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const me = await seedUser(db);
      await seedPerson(db, { name: "Anna", ownerId: me.id, visibilityLevel: "all" });
      await seedPerson(db, { name: "Bob", ownerId: me.id, visibilityLevel: "all" });
      await seedPerson(db, { name: "Cara", ownerId: me.id, visibilityLevel: "all" });

      const asc = await listPeople(
        db,
        regularActor(me.id),
        { offset: 0, limit: 50, sort: { field: "primaryEmail", dir: "asc" } },
        signal,
      );
      expect(asc.rows.map((r) => r.name)).toEqual(["Anna", "Bob", "Cara"]);

      const desc = await listPeople(
        db,
        regularActor(me.id),
        { offset: 0, limit: 50, sort: { field: "primaryEmail", dir: "desc" } },
        signal,
      );
      expect(desc.rows.map((r) => r.name)).toEqual(["Cara", "Bob", "Anna"]);
    });
  });

  it("sorts by a numeric custom field, empties last, and rejects an unknown key", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const me = await seedUser(db);
      const r = await createDef(
        db,
        { targetEntity: "person", type: "numeric", name: "Seats" },
        signal,
      );
      if (!r.ok) throw r.error;
      await seedPerson(db, {
        name: "ten",
        ownerId: me.id,
        visibilityLevel: "all",
        customFields: { seats: 10 },
      });
      await seedPerson(db, { name: "none", ownerId: me.id, visibilityLevel: "all" });
      await seedPerson(db, {
        name: "two",
        ownerId: me.id,
        visibilityLevel: "all",
        customFields: { seats: 2 },
      });
      const res = await listPeople(
        db,
        regularActor(me.id),
        { offset: 0, limit: 50, sort: { field: "cf:seats", dir: "desc" } },
        signal,
      );
      expect(res.rows.map((p) => p.name)).toEqual(["ten", "two", "none"]);
      expect(res.rows[0]?.customFields).toEqual({ seats: 10 });
      await expect(
        listPeople(
          db,
          regularActor(me.id),
          { offset: 0, limit: 50, sort: { field: "cf:nope", dir: "asc" } },
          signal,
        ),
      ).rejects.toMatchObject({ id: ERROR_IDS.CF_SORT_FIELD_INVALID });
    });
  });
});
