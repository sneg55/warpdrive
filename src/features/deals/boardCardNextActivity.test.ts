import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { activities, activityTypes, deals } from "@/db/schema";
import { settings } from "@/db/schema/system";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createDeal } from "./dealActions";
import { getBoardColumns } from "./dealRepo";

function admin(userId: string) {
  return {
    userId,
    isAdmin: true,
    isActive: true,
    sessionLive: true,
    visibilityGroupIds: [] as string[],
    managedUserIds: [] as string[],
    primaryVisibilityGroupId: null as string | null,
    flags: {} as Record<string, boolean>,
  };
}

describe("board card next-activity title", () => {
  // The card badge tooltip names the next action, so getBoardColumns must return the SUBJECT of
  // the soonest open, dated activity (the same row that drives next_activity_at), not just its date.
  it("returns the subject of the soonest open dated activity on each card", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const owner = await seedUser(db, { name: "Dana Owner" });
      const pipe = await seedPipelineWithStages(db, ["Lead"]);
      const stage = pipe.stages[0];
      if (!stage) throw new Error("no stage");

      await createDeal(
        db,
        admin(owner.id),
        { title: "Acme deal", pipelineId: pipe.pipeline.id, stageId: stage.id, value: 100 },
        signal,
      );
      const [deal] = await db
        .select({ id: deals.id })
        .from(deals)
        .where(eq(deals.title, "Acme deal"));
      if (!deal) throw new Error("deal insert failed");

      const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
      if (!type) throw new Error("no system 'call' activity type");

      // Two open dated activities: the soonest (earlier due_at) is the one the badge names.
      await db.insert(activities).values([
        {
          typeId: type.id,
          subject: "Prep the renewal quote",
          dueAt: new Date("2026-08-01T09:00:00Z"),
          ownerId: owner.id,
          assigneeId: owner.id,
          dealId: deal.id,
        },
        {
          typeId: type.id,
          subject: "Call Acme back",
          dueAt: new Date("2026-07-25T09:00:00Z"),
          ownerId: owner.id,
          assigneeId: owner.id,
          dealId: deal.id,
        },
      ]);

      const { cards } = await getBoardColumns(db, admin(owner.id), pipe.pipeline.id, signal);
      const card = cards.find((c) => c.title === "Acme deal");
      expect(card?.nextActivityTitle).toBe("Call Acme back");
    });
  });

  it("returns a null next-activity title when the card has no open dated activity", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const owner = await seedUser(db, { name: "Dana Owner" });
      const pipe = await seedPipelineWithStages(db, ["Lead"]);
      const stage = pipe.stages[0];
      if (!stage) throw new Error("no stage");

      await createDeal(
        db,
        admin(owner.id),
        { title: "Quiet deal", pipelineId: pipe.pipeline.id, stageId: stage.id, value: 100 },
        signal,
      );

      const { cards } = await getBoardColumns(db, admin(owner.id), pipe.pipeline.id, signal);
      const card = cards.find((c) => c.title === "Quiet deal");
      expect(card?.nextActivityTitle ?? null).toBeNull();
    });
  });
});
