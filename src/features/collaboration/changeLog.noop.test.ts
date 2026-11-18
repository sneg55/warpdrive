import { expect, it } from "vitest";
import { deals } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { listChangeLog, type RecordChangeArgs, recordChange } from "./changeLog";

type TestDbHandle = Parameters<Parameters<typeof withTestDb>[0]>[0];

async function seedDeal(db: TestDbHandle, ownerId: string): Promise<{ id: string }> {
  const pipe = await seedPipelineWithStages(db, ["Lead"]);
  const stage = pipe.stages[0];
  if (stage === undefined) throw new Error("stage seed failed");
  const [deal] = await db
    .insert(deals)
    .values({
      title: "D",
      pipelineId: pipe.pipeline.id,
      stageId: stage.id,
      ownerId,
      visibilityLevel: "all",
    })
    .returning();
  if (deal === undefined) throw new Error("deal seed failed");
  return deal;
}

async function recordAndCount(
  values: Pick<RecordChangeArgs, "oldValue" | "newValue">,
): Promise<number> {
  let count = -1;
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const deal = await seedDeal(db, user.id);
    await recordChange(
      db,
      { entityType: "deal", entityId: deal.id, field: "archived", actorId: user.id, ...values },
      signal,
    );
    count = (await listChangeLog(db, "deal", deal.id, signal)).length;
  });
  return count;
}

it("writes no row when the old and new boolean values are equal", async () => {
  expect(await recordAndCount({ oldValue: true, newValue: true })).toBe(0);
});

it("writes no row when the old and new string values are equal", async () => {
  expect(await recordAndCount({ oldValue: "won", newValue: "won" })).toBe(0);
});

it("treats undefined and null as the same empty value", async () => {
  expect(await recordAndCount({ oldValue: undefined, newValue: null })).toBe(0);
});

it("still writes a row when the values differ", async () => {
  expect(await recordAndCount({ oldValue: false, newValue: true })).toBe(1);
});
