import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { activities } from "@/db/schema/activities";
import { activityTypes } from "@/db/schema/activityTypes";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import {
  createType,
  deleteType,
  listTypes,
  renameType,
  reorderTypes,
  setTypeActive,
} from "./typesRepo";

let h: Awaited<ReturnType<typeof makeTestDb>>;
const sig = () => new AbortController().signal;
const key = () => `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;

beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);
afterAll(async () => {
  await h.close();
});

it("creates a type and lists it", async () => {
  const created = await createType(h.db, { key: key(), name: "Call", icon: "phone" }, sig());
  expect(created.ok).toBe(true);
  const rows = await listTypes(h.db, {}, sig());
  expect(rows.map((r) => r.name)).toContain("Call");
});

it("rejects a duplicate key with a clean error instead of a unique-violation crash", async () => {
  const k = key();
  const first = await createType(h.db, { key: k, name: "Call" }, sig());
  expect(first.ok).toBe(true);
  const dup = await createType(h.db, { key: k, name: "Call again" }, sig());
  expect(dup.ok).toBe(false);
  if (!dup.ok) expect(dup.error.id).toBe("E_ACTIVITY_004");
});

it("renames a type", async () => {
  const created = await createType(h.db, { key: key(), name: "Old" }, sig());
  if (!created.ok) throw new Error("setup failed");
  const renamed = await renameType(h.db, { id: created.value.id, name: "New" }, sig());
  expect(renamed.ok && renamed.value.name).toBe("New");
});

it("reorders types by ordered ids", async () => {
  const a = await createType(h.db, { key: key(), name: "A" }, sig());
  const b = await createType(h.db, { key: key(), name: "B" }, sig());
  if (!a.ok || !b.ok) throw new Error("setup failed");
  await reorderTypes(h.db, [b.value.id, a.value.id], sig());
  const [rowA] = await h.db
    .select({ order: activityTypes.order })
    .from(activityTypes)
    .where(eq(activityTypes.id, a.value.id));
  const [rowB] = await h.db
    .select({ order: activityTypes.order })
    .from(activityTypes)
    .where(eq(activityTypes.id, b.value.id));
  expect(rowB?.order).toBe(0);
  expect(rowA?.order).toBe(1);
});

it("archives (disables) a type and excludes it from the active list", async () => {
  const t = await createType(h.db, { key: key(), name: "Lunch" }, sig());
  if (!t.ok) throw new Error("setup failed");
  const off = await setTypeActive(h.db, { id: t.value.id, active: false }, sig());
  expect(off.ok && off.value.archivedAt).not.toBeNull();

  const active = await listTypes(h.db, { activeOnly: true }, sig());
  expect(active.map((r) => r.id)).not.toContain(t.value.id);
  const all = await listTypes(h.db, {}, sig());
  expect(all.map((r) => r.id)).toContain(t.value.id);

  const on = await setTypeActive(h.db, { id: t.value.id, active: true }, sig());
  expect(on.ok && on.value.archivedAt).toBeNull();
});

it("blocks deleting a system type", async () => {
  const [row] = await h.db
    .insert(activityTypes)
    .values({ key: key(), name: "System", isSystem: true })
    .returning();
  if (row === undefined) throw new Error("setup failed");
  const r = await deleteType(h.db, { id: row.id }, sig());
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.id).toBe(ERROR_IDS.ACTIVITY_TYPE_IN_USE);
});

it("blocks deleting a type referenced by an activity", async () => {
  const t = await createType(h.db, { key: key(), name: "Referenced" }, sig());
  if (!t.ok) throw new Error("setup failed");
  const u = await seedUser(h.db);
  await h.db.insert(activities).values({
    typeId: t.value.id,
    subject: "ref",
    ownerId: u.id,
    assigneeId: u.id,
  });
  const r = await deleteType(h.db, { id: t.value.id }, sig());
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.id).toBe(ERROR_IDS.ACTIVITY_TYPE_IN_USE);
});

it("deletes an unused non-system type", async () => {
  const t = await createType(h.db, { key: key(), name: "Deletable" }, sig());
  if (!t.ok) throw new Error("setup failed");
  const r = await deleteType(h.db, { id: t.value.id }, sig());
  expect(r.ok).toBe(true);
  const [gone] = await h.db.select().from(activityTypes).where(eq(activityTypes.id, t.value.id));
  expect(gone).toBeUndefined();
});
