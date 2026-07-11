// Codex finding F22: resolveDealParent fetched the parent pipeline only for
// visibilityGroupId and never checked isArchived. calendarRange, listActivitiesForEntity,
// completeActivity, and file activity auth all trust resolveActivityVisibility, so an
// activity whose dominant parent is a deal in an archived pipeline stayed visible and
// mutable. It must resolve to null (hidden) like every other archived-pipeline read.
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { activities, activityTypes, deals } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { resolveActivityVisibility } from "./visibility";

describe("activity visibility for archived-pipeline deals", () => {
  it("resolveActivityVisibility returns null for an activity on an archived-pipeline deal", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["Lead"], { isArchived: true });
      const [deal] = await db
        .insert(deals)
        .values({
          title: "D",
          pipelineId: p.pipeline.id,
          stageId: p.stages[0]!.id,
          ownerId: u.id,
          visibilityLevel: "all",
        })
        .returning();
      if (!deal) throw new Error("deal seed failed");

      const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
      if (!type) throw new Error("activity type 'call' not found");

      const [activity] = await db
        .insert(activities)
        .values({
          typeId: type.id,
          subject: "call",
          ownerId: u.id,
          assigneeId: u.id,
          dealId: deal.id,
        })
        .returning();
      if (!activity) throw new Error("activity seed failed");

      const vis = await resolveActivityVisibility(db, activity, new AbortController().signal);
      expect(vis).toBeNull();
    });
  });
});
