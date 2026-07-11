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

// Regression: the composer writes activities.video_call_url, but the read layer never selected it
// (hardcoded null in the visibility mapper, omitted from the output projection), so a saved video
// call link was invisible everywhere after save. listActivitiesForEntity must carry it through.
it("surfaces the video call url for a deal activity that has one", async () => {
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
    await db.insert(activities).values({
      typeId: type.id,
      subject: "Video sync",
      ownerId: user.id,
      assigneeId: user.id,
      dealId: deal.id,
      dueAt: new Date("2026-07-02T10:00:00Z"),
      videoCallUrl: "https://meet.example.com/abc-defg-hij",
    });

    const rows = await listActivitiesForEntity(db, actor, "deal", deal.id, signal);
    expect(rows[0]?.videoCallUrl).toBe("https://meet.example.com/abc-defg-hij");
  });
});
