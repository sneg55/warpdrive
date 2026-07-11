import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { lostReasons } from "@/db/schema/lostReasons";
import { makeTestDb } from "@/test/db";
import {
  archiveLostReason,
  createLostReason,
  listLostReasons,
  renameLostReason,
  reorderLostReasons,
} from "./lostReasonsRepo";

let h: Awaited<ReturnType<typeof makeTestDb>>;
const sig = () => new AbortController().signal;
beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);
afterAll(async () => {
  await h.close();
});

it("creates and lists a lost reason", async () => {
  const r = await createLostReason(h.db, { name: "Too expensive" }, sig());
  expect(r.ok).toBe(true);
  const list = await listLostReasons(h.db, sig());
  expect(list.map((x) => x.name)).toContain("Too expensive");
});

it("renames a lost reason", async () => {
  const r = await createLostReason(h.db, { name: "Old reason" }, sig());
  if (!r.ok) throw new Error("setup failed");
  const renamed = await renameLostReason(h.db, { id: r.value.id, name: "New reason" }, sig());
  expect(renamed.ok && renamed.value.name).toBe("New reason");
});

it("reorders lost reasons by ordered ids", async () => {
  const a = await createLostReason(h.db, { name: "A" }, sig());
  const b = await createLostReason(h.db, { name: "B" }, sig());
  if (!a.ok || !b.ok) throw new Error("setup failed");
  await reorderLostReasons(h.db, [b.value.id, a.value.id], sig());
  const [rowA] = await h.db
    .select({ order: lostReasons.order })
    .from(lostReasons)
    .where(eq(lostReasons.id, a.value.id));
  const [rowB] = await h.db
    .select({ order: lostReasons.order })
    .from(lostReasons)
    .where(eq(lostReasons.id, b.value.id));
  expect(rowB?.order).toBe(0);
  expect(rowA?.order).toBe(1);
});

it("excludes archived reasons from the list", async () => {
  const r = await createLostReason(h.db, { name: "Archive me" }, sig());
  if (!r.ok) throw new Error("setup failed");
  const archived = await archiveLostReason(h.db, { id: r.value.id }, sig());
  expect(archived.ok && archived.value.archivedAt).not.toBeNull();
  const list = await listLostReasons(h.db, sig());
  expect(list.map((x) => x.id)).not.toContain(r.value.id);
});

it("rename of a missing reason returns LOST_REASON_NOT_FOUND", async () => {
  const r = await renameLostReason(
    h.db,
    { id: "00000000-0000-0000-0000-000000000000", name: "x" },
    sig(),
  );
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.id).toBe(ERROR_IDS.LOST_REASON_NOT_FOUND);
});
