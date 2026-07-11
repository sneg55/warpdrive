import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { personLabels } from "@/db/schema/labels";
import { persons } from "@/db/schema/persons";
import { labels } from "@/db/schema/system";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import {
  createLabel,
  deleteLabel,
  listLabels,
  renameLabel,
  reorderLabels,
  setLabelColor,
} from "./labelsRepo";

let h: Awaited<ReturnType<typeof makeTestDb>>;
const sig = () => new AbortController().signal;
beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);
afterAll(async () => {
  await h.close();
});

it("creates a label and lists it by target", async () => {
  // Unique name so the assertion is independent of the seeded Hot/Warm/Cold catalog (migration 0046).
  const r = await createLabel(h.db, { target: "deal", name: "DealOnlyZ", color: "red" }, sig());
  expect(r.ok).toBe(true);
  const dealLabelsList = await listLabels(h.db, { target: "deal" }, sig());
  expect(dealLabelsList.map((l) => l.name)).toContain("DealOnlyZ");
  // A person-target list must not include the deal-only label.
  const personList = await listLabels(h.db, { target: "person" }, sig());
  expect(personList.map((l) => l.name)).not.toContain("DealOnlyZ");
});

it("renames and recolors a label", async () => {
  const r = await createLabel(h.db, { target: "person", name: "VIP", color: "blue" }, sig());
  if (!r.ok) throw new Error("setup failed");
  const renamed = await renameLabel(h.db, { id: r.value.id, name: "Very Important" }, sig());
  expect(renamed.ok && renamed.value.name).toBe("Very Important");
  const recolored = await setLabelColor(h.db, { id: r.value.id, color: "magenta" }, sig());
  expect(recolored.ok && recolored.value.color).toBe("magenta");
});

it("reorders labels by ordered ids", async () => {
  const a = await createLabel(h.db, { target: "organization", name: "A", color: "green" }, sig());
  const b = await createLabel(h.db, { target: "organization", name: "B", color: "teal" }, sig());
  if (!a.ok || !b.ok) throw new Error("setup failed");
  await reorderLabels(h.db, [b.value.id, a.value.id], sig());
  const [rowA] = await h.db
    .select({ order: labels.order })
    .from(labels)
    .where(eq(labels.id, a.value.id));
  const [rowB] = await h.db
    .select({ order: labels.order })
    .from(labels)
    .where(eq(labels.id, b.value.id));
  expect(rowB?.order).toBe(0);
  expect(rowA?.order).toBe(1);
});

it("deletes an unused label", async () => {
  const r = await createLabel(h.db, { target: "deal", name: "Unused", color: "gray" }, sig());
  if (!r.ok) throw new Error("setup failed");
  const del = await deleteLabel(h.db, { id: r.value.id }, sig());
  expect(del.ok).toBe(true);
  const [gone] = await h.db.select().from(labels).where(eq(labels.id, r.value.id));
  expect(gone).toBeUndefined();
});

it("blocks deleting a label applied to a record", async () => {
  const u = await seedUser(h.db);
  const [person] = await h.db
    .insert(persons)
    .values({ name: "Jane", ownerId: u.id, visibilityLevel: "all" })
    .returning();
  const r = await createLabel(h.db, { target: "person", name: "InUse", color: "orange" }, sig());
  if (!r.ok || person === undefined) throw new Error("setup failed");
  await h.db.insert(personLabels).values({ personId: person.id, labelId: r.value.id });

  const del = await deleteLabel(h.db, { id: r.value.id }, sig());
  expect(del.ok).toBe(false);
  if (!del.ok) {
    expect(del.error.id).toBe(ERROR_IDS.LABEL_IN_USE);
    expect(del.error.context?.count).toBe(1);
  }
});

it("delete of a missing label returns LABEL_NOT_FOUND", async () => {
  const del = await deleteLabel(h.db, { id: "00000000-0000-0000-0000-000000000000" }, sig());
  expect(del.ok).toBe(false);
  if (!del.ok) expect(del.error.id).toBe(ERROR_IDS.LABEL_NOT_FOUND);
});
