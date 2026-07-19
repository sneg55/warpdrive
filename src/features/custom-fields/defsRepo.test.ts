import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { customFieldDefs } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import {
  archiveDef,
  createDef,
  listDefs,
  reorderDefs,
  setDefFlags,
  updateDefName,
} from "./defsRepo";

it("freezes a slug key from the name and rejects a duplicate", async () => {
  await withTestDb(async (db) => {
    const r1 = await createDef(
      db,
      { targetEntity: "deal", type: "text", name: "Account Owner" },
      new AbortController().signal,
    );
    expect(r1.ok).toBe(true);
    if (r1.ok === true) expect(r1.value.key).toBe("account_owner");

    const r2 = await createDef(
      db,
      { targetEntity: "deal", type: "text", name: "Account Owner" },
      new AbortController().signal,
    );
    expect(r2.ok).toBe(false);
    if (r2.ok === false) expect(r2.error.id).toBe("E_CF_001");
  });
});

it("serves a cached def list within the TTL and invalidates it on a mutation", async () => {
  await withTestDb(async (db) => {
    const sig = (): AbortSignal => new AbortController().signal;
    const first = await listDefs(db, "deal", {}, sig());
    const second = await listDefs(db, "deal", {}, sig());
    // Built once per (db, target) within the window, not rebuilt on every call.
    expect(second).toBe(first);

    const created = await createDef(
      db,
      { targetEntity: "deal", type: "text", name: "Region" },
      sig(),
    );
    if (created.ok === false) throw new Error("setup failed");

    const afterCreate = await listDefs(db, "deal", {}, sig());
    // The mutation invalidated the cache, so the new def is visible immediately (not stale).
    expect(afterCreate).not.toBe(first);
    expect(afterCreate.find((d) => d.id === created.value.id)).toBeDefined();
  });
});

it("archives a def so it disappears from the default list but stays addressable", async () => {
  await withTestDb(async (db) => {
    const created = await createDef(
      db,
      { targetEntity: "person", type: "text", name: "Seniority" },
      new AbortController().signal,
    );
    if (created.ok === false) throw new Error("setup failed");

    const archived = await archiveDef(db, created.value.id, new AbortController().signal);
    expect(archived.ok).toBe(true);

    const active = await listDefs(db, "person", {}, new AbortController().signal);
    expect(active.find((d) => d.id === created.value.id)).toBeUndefined();

    const all = await listDefs(
      db,
      "person",
      { includeArchived: true },
      new AbortController().signal,
    );
    expect(all.find((d) => d.id === created.value.id)).toBeDefined();
  });
});

it("renames a def by id, changing the name but never the frozen key", async () => {
  await withTestDb(async (db) => {
    const created = await createDef(
      db,
      { targetEntity: "deal", type: "text", name: "Account Owner" },
      new AbortController().signal,
    );
    if (created.ok === false) throw new Error("setup failed");

    const renamed = await updateDefName(
      db,
      { id: created.value.id, name: "Owner" },
      new AbortController().signal,
    );
    expect(renamed.ok).toBe(true);
    if (renamed.ok === true) {
      expect(renamed.value.name).toBe("Owner");
      // key is frozen: entity values are stored under it, so it must not move.
      expect(renamed.value.key).toBe("account_owner");
    }
  });
});

it("returns CF_DEF_NOT_FOUND when renaming a missing def", async () => {
  await withTestDb(async (db) => {
    const r = await updateDefName(
      db,
      { id: "00000000-0000-0000-0000-000000000000", name: "X" },
      new AbortController().signal,
    );
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error.id).toBe("E_CF_002");
  });
});

it("reorders defs by writing the order column in a transaction", async () => {
  await withTestDb(async (db) => {
    const a = await createDef(
      db,
      { targetEntity: "deal", type: "text", name: "Field A" },
      new AbortController().signal,
    );
    const b = await createDef(
      db,
      { targetEntity: "deal", type: "text", name: "Field B" },
      new AbortController().signal,
    );
    if (a.ok === false || b.ok === false) throw new Error("setup failed");

    // Both start at order 0 (schema default); put B before A.
    const r = await reorderDefs(db, [b.value.id, a.value.id], new AbortController().signal);
    expect(r.ok).toBe(true);

    // listDefs sorts by order asc, so the new order is observable through it.
    const listed = await listDefs(db, "deal", {}, new AbortController().signal);
    expect(listed.map((d) => d.id)).toEqual([b.value.id, a.value.id]);
  });
});

it("persists the important + show-in-add-form flags", async () => {
  await withTestDb(async (db) => {
    const created = await createDef(
      db,
      { targetEntity: "deal", type: "text", name: "Champion" },
      new AbortController().signal,
    );
    if (created.ok === false) throw new Error("setup failed");

    const r = await setDefFlags(
      db,
      { id: created.value.id, isImportant: true, showInAddForm: true },
      new AbortController().signal,
    );
    expect(r.ok).toBe(true);

    const [row] = await db
      .select()
      .from(customFieldDefs)
      .where(eq(customFieldDefs.id, created.value.id));
    expect(row?.isImportant).toBe(true);
    expect(row?.showInAddForm).toBe(true);

    // listDefs / toDef must project both flags too.
    const listed = await listDefs(db, "deal", {}, new AbortController().signal);
    const found = listed.find((d) => d.id === created.value.id);
    expect(found?.isImportant).toBe(true);
    expect(found?.showInAddForm).toBe(true);
  });
});

it("returns CF_DEF_NOT_FOUND when setting flags on a missing def", async () => {
  await withTestDb(async (db) => {
    const r = await setDefFlags(
      db,
      { id: "00000000-0000-0000-0000-000000000000", isImportant: true, showInAddForm: false },
      new AbortController().signal,
    );
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error.id).toBe("E_CF_002");
  });
});
