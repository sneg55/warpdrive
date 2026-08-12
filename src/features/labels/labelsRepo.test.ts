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
  listAppliedLabelNames,
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

// Entities store the label NAME, and the chip resolver matches the catalog by name, so a rename
// that only touches the catalog row silently unresolves every record still carrying the old
// string: the chip goes gray and the label filter stops matching it.
it("rewrites the applied name on records when a label is renamed", async () => {
  const u = await seedUser(h.db);
  const r = await createLabel(h.db, { target: "person", name: "OldName", color: "blue" }, sig());
  if (!r.ok) throw new Error("setup failed");
  const [p] = await h.db
    .insert(persons)
    .values({ name: "Rex", ownerId: u.id, visibilityLevel: "all", labels: ["OldName", "Other"] })
    .returning();
  if (p === undefined) throw new Error("setup failed");

  await renameLabel(h.db, { id: r.value.id, name: "NewName" }, sig());

  const [after] = await h.db
    .select({ labels: persons.labels })
    .from(persons)
    .where(eq(persons.id, p.id));
  expect(after?.labels).toEqual(["NewName", "Other"]);
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

// Production applies labels by writing the NAME into the entity's text[] column, not by inserting
// a join row (see personsRepo/leadUpdate). The guard must see that usage, otherwise Settings
// deletes a label that records still display and leaves orphan strings behind.
it("blocks deleting a label applied through the entity labels array", async () => {
  const u = await seedUser(h.db);
  const r = await createLabel(
    h.db,
    { target: "person", name: "ArrayApplied", color: "orange" },
    sig(),
  );
  if (!r.ok) throw new Error("setup failed");
  await h.db
    .insert(persons)
    .values({ name: "Ann", ownerId: u.id, visibilityLevel: "all", labels: ["ArrayApplied"] });

  const del = await deleteLabel(h.db, { id: r.value.id }, sig());
  expect(del.ok).toBe(false);
  if (!del.ok) {
    expect(del.error.id).toBe(ERROR_IDS.LABEL_IN_USE);
    expect(del.error.context?.count).toBe(1);
  }
});

// Usage is per target: the same string on a person must not protect an organization label.
it("counts array usage only within the label's own target", async () => {
  const u = await seedUser(h.db);
  const r = await createLabel(
    h.db,
    { target: "organization", name: "Scoped", color: "teal" },
    sig(),
  );
  if (!r.ok) throw new Error("setup failed");
  await h.db
    .insert(persons)
    .values({ name: "Bo", ownerId: u.id, visibilityLevel: "all", labels: ["Scoped"] });

  const del = await deleteLabel(h.db, { id: r.value.id }, sig());
  expect(del.ok).toBe(true);
});

// resolveLabelChips matches the catalog case-insensitively ("hot" resolves to "Hot"), so the
// guard has to use the same matching or it under-counts legacy lowercase applications.
it("counts array usage case-insensitively", async () => {
  const u = await seedUser(h.db);
  const r = await createLabel(h.db, { target: "person", name: "Casing", color: "teal" }, sig());
  if (!r.ok) throw new Error("setup failed");
  await h.db
    .insert(persons)
    .values({ name: "Cy", ownerId: u.id, visibilityLevel: "all", labels: ["casing"] });

  const del = await deleteLabel(h.db, { id: r.value.id }, sig());
  expect(del.ok).toBe(false);
});

// Feeds the filter menus, so it has to report what records CARRY, catalogued or not.
it("lists applied names for a target, deduped, catalogued or not", async () => {
  const u = await seedUser(h.db);
  await h.db.insert(persons).values([
    { name: "One", ownerId: u.id, visibilityLevel: "all", labels: ["AppliedZ", "SharedZ"] },
    { name: "Two", ownerId: u.id, visibilityLevel: "all", labels: ["SharedZ"] },
  ]);

  const names = await listAppliedLabelNames(h.db, "person", sig());

  expect(names).toContain("AppliedZ");
  expect(names.filter((n) => n === "SharedZ")).toHaveLength(1);
});

it("delete of a missing label returns LABEL_NOT_FOUND", async () => {
  const del = await deleteLabel(h.db, { id: "00000000-0000-0000-0000-000000000000" }, sig());
  expect(del.ok).toBe(false);
  if (!del.ok) expect(del.error.id).toBe(ERROR_IDS.LABEL_NOT_FOUND);
});
