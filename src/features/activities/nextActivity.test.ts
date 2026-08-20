import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { activities, activityTypes, deals } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { recomputeNextActivity } from "./nextActivity";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

it("does not bump the deal's updatedAt CAS token when recomputing next_activity_at", async () => {
  const db = ctx.db;
  const user = await seedUser(db, { isAdmin: true });
  const pipe = await seedPipelineWithStages(db, ["Lead"]);
  const [deal] = await db
    .insert(deals)
    .values({
      title: "CAS token deal",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]?.id ?? "",
      ownerId: user.id,
      visibilityLevel: "all",
    })
    .returning();
  if (deal === undefined) throw new Error("deal seed failed");

  const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (type === undefined) throw new Error("call activity type missing");
  await db.insert(activities).values({
    typeId: type.id,
    subject: "Follow up",
    dealId: deal.id,
    ownerId: user.id,
    assigneeId: user.id,
    dueAt: new Date("2030-01-01T10:00:00.000Z"),
  });

  await recomputeNextActivity(db, deal.id, AbortSignal.timeout(10_000));

  const [after] = await db.select().from(deals).where(eq(deals.id, deal.id));
  if (after === undefined) throw new Error("deal disappeared");
  // next_activity_at is a derived cache of the deal's activities, not an edit to the deal. Bumping
  // updatedAt here invalidates the open editor's compare-and-swap token, so a stage change made
  // right after adding an activity fails its CAS with "This deal changed elsewhere" (E_DEAL_002).
  expect(after.nextActivityAt?.toISOString()).toBe("2030-01-01T10:00:00.000Z");
  expect(after.updatedAt.getTime()).toBe(deal.updatedAt.getTime());
});
