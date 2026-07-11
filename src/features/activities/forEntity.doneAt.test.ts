import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { activities, activityTypes, deals } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { listActivitiesForEntity } from "./forEntity";

function makeActor(id: string): PermSetUser {
  return { id, type: "regular", isActive: true, groupIds: new Set(), flags: new Set() };
}

// Regression: the read layer used to hardcode doneAt: null, so the history card could never show
// WHEN an activity was completed. listActivitiesForEntity must carry the real completion timestamp.
it("surfaces the completion timestamp (doneAt) for a done deal activity", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db, { name: "Owner" });
    const actor = makeActor(user.id);
    const pipe = await seedPipelineWithStages(db, ["Lead"]);
    const stage = pipe.stages[0];
    if (stage === undefined) throw new Error("stage seed failed");
    const [deal] = await db
      .insert(deals)
      .values({
        title: "D",
        pipelineId: pipe.pipeline.id,
        stageId: stage.id,
        ownerId: user.id,
        visibilityLevel: "all",
      })
      .returning();
    if (deal === undefined) throw new Error("deal seed failed");
    const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
    if (type === undefined) throw new Error("activity type 'call' not found");
    const completedAt = new Date("2026-07-06T20:42:00Z");
    await db.insert(activities).values({
      typeId: type.id,
      subject: "Done call",
      ownerId: user.id,
      assigneeId: user.id,
      dealId: deal.id,
      dueAt: new Date("2026-07-02T10:00:00Z"),
      done: true,
      doneAt: completedAt,
    });

    const rows = await listActivitiesForEntity(db, actor, "deal", deal.id, signal);
    expect(rows[0]?.done).toBe(true);
    expect(rows[0]?.doneAt?.getTime()).toBe(completedAt.getTime());
  });
});
