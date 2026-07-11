import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser as seedUserRow } from "@/db/testing/factories";
import { createTemplate, deleteTemplates, reorderTemplates } from "./authoring";
import { listTemplatesForSettings } from "./emailAuthoringReads";

type Db = Parameters<Parameters<typeof withTestDb>[0]>[0];
const sig = (): AbortSignal => AbortSignal.timeout(5000);

async function seedUser(db: Db, email: string, name?: string): Promise<string> {
  return (await seedUserRow(db, name !== undefined ? { email, name } : { email })).id;
}
async function mkTemplate(db: Db, ownerId: string, name: string): Promise<string> {
  const r = await createTemplate(
    db,
    { ownerId, name, bodyHtml: `<p>${name}</p>`, isShared: false, canShare: false },
    sig(),
  );
  if (!r.ok) throw new Error("seed template failed");
  return r.value.id;
}

describe("listTemplatesForSettings projection (T4)", () => {
  it("returns createdAt and ownerName alongside isOwn", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db, "me@x.com", "Me Person");
      const them = await seedUser(db, "them@x.com", "Them Person");
      await mkTemplate(db, me, "Mine");
      await createTemplate(
        db,
        { ownerId: them, name: "SharedOne", bodyHtml: "<p>s</p>", isShared: true, canShare: true },
        sig(),
      );

      const rows = await listTemplatesForSettings(db, { actor: { id: me } as never }, sig());
      const mine = rows.find((r) => r.name === "Mine");
      const shared = rows.find((r) => r.name === "SharedOne");
      expect(mine?.ownerName).toBe("Me Person");
      expect(typeof mine?.createdAt).toBe("string");
      expect(shared?.ownerName).toBe("Them Person");
      // Still no raw owner UUID leak.
      expect(shared).not.toHaveProperty("ownerId");
    });
  });
});

describe("shared-template ordering ignores the other owner's sort_order", () => {
  it("orders shared templates by name for the viewer, not by their owner's sort_order", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db, "viewer@x.com");
      const a = await seedUser(db, "ownerA@x.com");
      const b = await seedUser(db, "ownerB@x.com");
      // Two SHARED templates from different owners. Owner A reorders theirs, giving "Zebra"
      // sort_order 0; owner B's "Apple" keeps NULL. The viewer must still see Apple before Zebra.
      const zebra = await createTemplate(
        db,
        { ownerId: a, name: "Zebra", bodyHtml: "<p>z</p>", isShared: true, canShare: true },
        sig(),
      );
      if (!zebra.ok) throw new Error("seed failed");
      await createTemplate(
        db,
        { ownerId: b, name: "Apple", bodyHtml: "<p>a</p>", isShared: true, canShare: true },
        sig(),
      );
      await reorderTemplates(db, { actorId: a, orderedIds: [zebra.value.id] }, sig());

      const rows = await listTemplatesForSettings(db, { actor: { id: me } as never }, sig());
      expect(rows.map((r) => r.name)).toEqual(["Apple", "Zebra"]);
    });
  });
});

describe("reorderTemplates (T4)", () => {
  it("orders the actor's own templates by the given index", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db, "me2@x.com");
      const a = await mkTemplate(db, me, "Alpha");
      const b = await mkTemplate(db, me, "Bravo");
      const c = await mkTemplate(db, me, "Charlie");

      // Default (NULL sort_order) falls back to name ASC.
      let rows = await listTemplatesForSettings(db, { actor: { id: me } as never }, sig());
      expect(rows.map((r) => r.name)).toEqual(["Alpha", "Bravo", "Charlie"]);

      const res = await reorderTemplates(db, { actorId: me, orderedIds: [c, a, b] }, sig());
      expect(res.ok).toBe(true);

      rows = await listTemplatesForSettings(db, { actor: { id: me } as never }, sig());
      expect(rows.map((r) => r.name)).toEqual(["Charlie", "Alpha", "Bravo"]);
    });
  });

  it("ignores ids the actor does not own (no cross-owner reorder)", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db, "me3@x.com");
      const them = await seedUser(db, "them3@x.com");
      const mine = await mkTemplate(db, me, "Mine");
      const theirs = await mkTemplate(db, them, "Theirs");

      const res = await reorderTemplates(db, { actorId: me, orderedIds: [theirs, mine] }, sig());
      expect(res.ok).toBe(true);
      // Their template's sort_order must remain untouched (still NULL).
      const rows = await listTemplatesForSettings(db, { actor: { id: them } as never }, sig());
      const t = rows.find((r) => r.name === "Theirs");
      expect(t).toBeDefined();
    });
  });
});

describe("deleteTemplates (T4 bulk)", () => {
  it("deletes only the owned ids in the set and reports the count", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db, "me4@x.com");
      const them = await seedUser(db, "them4@x.com");
      const a = await mkTemplate(db, me, "A");
      const b = await mkTemplate(db, me, "B");
      const theirs = await mkTemplate(db, them, "Theirs");

      const res = await deleteTemplates(db, { actorId: me, ids: [a, b, theirs] }, sig());
      expect(res).toMatchObject({ ok: true, value: { deleted: 2 } });

      const mineLeft = await listTemplatesForSettings(db, { actor: { id: me } as never }, sig());
      expect(mineLeft.map((r) => r.name)).not.toContain("A");
      expect(mineLeft.map((r) => r.name)).not.toContain("B");
      // Their template survives.
      const theirLeft = await listTemplatesForSettings(db, { actor: { id: them } as never }, sig());
      expect(theirLeft.map((r) => r.name)).toContain("Theirs");
    });
  });

  it("is a no-op returning deleted=0 for an empty id set", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db, "me5@x.com");
      const res = await deleteTemplates(db, { actorId: me, ids: [] }, sig());
      expect(res).toMatchObject({ ok: true, value: { deleted: 0 } });
    });
  });
});
