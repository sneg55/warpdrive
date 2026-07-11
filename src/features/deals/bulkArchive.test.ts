import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { deals } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb } from "@/test/db";
import { archiveDeals } from "./bulkArchive";

let h: Awaited<ReturnType<typeof makeTestDb>>;
const sig = () => new AbortController().signal;
beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);
afterAll(async () => {
  await h.close();
});

function actor(id: string): PermSetUser {
  return { id, type: "admin", isActive: true, groupIds: new Set(), flags: new Set() };
}

async function seedDeal(ownerId: string, title: string) {
  const { pipeline, stages } = await seedPipelineWithStages(h.db, ["Qualified"]);
  const [d] = await h.db
    .insert(deals)
    .values({
      title,
      pipelineId: pipeline.id,
      stageId: stages[0]!.id,
      ownerId,
      visibilityLevel: "all",
    })
    .returning();
  if (d === undefined) throw new Error("deal insert returned undefined");
  return d;
}

async function readDeal(dealId: string) {
  const [row] = await h.db.select().from(deals).where(eq(deals.id, dealId));
  if (row === undefined) throw new Error("deal vanished");
  return row;
}

it("archives every deal in the list and returns the count", async () => {
  const u = await seedUser(h.db);
  const d1 = await seedDeal(u.id, "One");
  const d2 = await seedDeal(u.id, "Two");
  const r = await archiveDeals(h.db, actor(u.id), [d1.id, d2.id], true, sig());
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.value).toBe(2);
  expect((await readDeal(d1.id)).archivedAt).not.toBeNull();
  expect((await readDeal(d2.id)).archivedAt).not.toBeNull();
});

it("skips ids that do not resolve to a deal and counts only real ones", async () => {
  const u = await seedUser(h.db);
  const d1 = await seedDeal(u.id, "Real");
  const missing = "00000000-0000-0000-0000-000000000000";
  const r = await archiveDeals(h.db, actor(u.id), [d1.id, missing], true, sig());
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.value).toBe(1);
  expect((await readDeal(d1.id)).archivedAt).not.toBeNull();
});
