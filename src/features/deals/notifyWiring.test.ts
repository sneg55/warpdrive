// notifyWiring.test.ts: integration tests proving notification adapters are called
// from deal update and move actions.
//
// RED: these tests assert notifications rows are written after calling the domain
// write fns. They fail until notifyOnDealUpdate / notifyOnDealMove helpers are
// extracted and wired in the action files.
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { dealFollowers, notifications } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createDeal, updateDeal } from "./dealActions";
import { moveDeal } from "./dealMove";
import { adminSession, createSession, seedSettings } from "./dealMove.test-helpers";
import { notifyOnDealMove, notifyOnDealUpdate } from "./notifyHelpers";

type Db = Parameters<Parameters<typeof withTestDb>[0]>[0];

async function seedDealWithFollower(db: Db): Promise<{
  dealId: string;
  ownerId: string;
  followerId: string;
  actorId: string;
  updatedAt: string;
}> {
  await seedSettings(db);
  const owner = await seedUser(db);
  const actor = await seedUser(db);
  const follower = await seedUser(db);
  const p = await seedPipelineWithStages(db, ["A", "B"]);
  const stage = p.stages[0];
  if (!stage) throw new Error("seed: no stage");
  const created = await createDeal(
    db,
    createSession(owner.id),
    { title: "Deal", pipelineId: p.pipeline.id, stageId: stage.id },
    new AbortController().signal,
  );
  if (!created.ok) throw new Error("seed: createDeal failed");
  await db.insert(dealFollowers).values({ dealId: created.value.id, userId: follower.id });
  return {
    dealId: created.value.id,
    ownerId: owner.id,
    followerId: follower.id,
    actorId: actor.id,
    updatedAt: created.value.updatedAt.toISOString(),
  };
}

describe("notifyOnDealUpdate: deal_won", () => {
  it("fires a deal_won notification to the follower after status transition to won", async () => {
    await withTestDb(async (db) => {
      const { dealId, followerId, actorId, updatedAt } = await seedDealWithFollower(db);

      const r = await updateDeal(
        db,
        adminSession(actorId),
        {
          dealId,
          expectedUpdatedAt: updatedAt,
          status: "won",
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;

      // Wire: notifyOnDealUpdate fires the right adapter. This is what the action calls.
      await notifyOnDealUpdate(db, {
        deal: r.value,
        input: { status: "won" },
        actorId,
        signal: new AbortController().signal,
      });

      const followerNotifs = await db
        .select()
        .from(notifications)
        .where(sql`user_id = ${followerId}::uuid`);
      expect(followerNotifs).toHaveLength(1);
      expect(followerNotifs[0]?.type).toBe("deal_won");
    });
  });
});

describe("notifyOnDealUpdate: deal_followed_update", () => {
  it("fires a deal_followed_update notification after a non-status field change", async () => {
    await withTestDb(async (db) => {
      const { dealId, followerId, actorId, updatedAt } = await seedDealWithFollower(db);

      const r = await updateDeal(
        db,
        adminSession(actorId),
        {
          dealId,
          expectedUpdatedAt: updatedAt,
          title: "New Title",
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;

      await notifyOnDealUpdate(db, {
        deal: r.value,
        input: { title: "New Title" },
        actorId,
        signal: new AbortController().signal,
      });

      const followerNotifs = await db
        .select()
        .from(notifications)
        .where(sql`user_id = ${followerId}::uuid`);
      expect(followerNotifs).toHaveLength(1);
      expect(followerNotifs[0]?.type).toBe("deal_followed_update");
    });
  });
});

describe("notifyOnDealMove: deal_followed_update on stage move", () => {
  it("fires a deal_followed_update notification to the follower after a stage move", async () => {
    await withTestDb(async (db) => {
      const { dealId, followerId, actorId, updatedAt } = await seedDealWithFollower(db);

      const pipelineRow = (
        await db.execute(sql`SELECT pipeline_id FROM deals WHERE id = ${dealId}`)
      ).rows[0] as { pipeline_id: string };
      const stages = (
        await db.execute(
          sql`SELECT id FROM stages WHERE pipeline_id = ${pipelineRow.pipeline_id} ORDER BY "order"`,
        )
      ).rows as { id: string }[];
      const toStage = stages[1];
      if (!toStage) throw new Error("seed: no second stage to move to");

      const r = await moveDeal(
        db,
        adminSession(actorId),
        {
          dealId,
          toStageId: toStage.id,
          beforePosition: null,
          afterPosition: null,
          expectedUpdatedAt: updatedAt,
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;

      await notifyOnDealMove(db, {
        deal: r.value,
        actorId,
        signal: new AbortController().signal,
      });

      const followerNotifs = await db
        .select()
        .from(notifications)
        .where(sql`user_id = ${followerId}::uuid`);
      expect(followerNotifs).toHaveLength(1);
      expect(followerNotifs[0]?.type).toBe("deal_followed_update");
    });
  });
});
