import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { notifications } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { scrubInaccessible } from "./scrub";

async function seedDeal(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  ownerId: string,
  visibilityLevel: "all" | "owner" | "group",
): Promise<string> {
  const { pipeline, stages } = await seedPipelineWithStages(db, ["Open"]);
  const stage = stages[0];
  if (stage === undefined) throw new Error("seedDeal: no stage returned");
  const row = (
    await db.execute(sql`
      INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level)
      VALUES ('Test Deal', ${pipeline.id}, ${stage.id}, ${ownerId}, ${visibilityLevel})
      RETURNING id
    `)
  ).rows[0] as { id: string } | undefined;
  if (row === undefined) throw new Error("seedDeal: insert returned no rows");
  return row.id;
}

describe("scrubInaccessible", () => {
  it("deletes notifications for a user who lost access after visibility tightened", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const bob = await seedUser(db);
      const dealId = await seedDeal(db, owner.id, "all");

      await db.insert(notifications).values({
        userId: bob.id,
        type: "deal_followed_update",
        entityType: "deal",
        entityId: dealId,
        actorId: owner.id,
        payload: {},
      });

      await db.execute(sql`UPDATE deals SET visibility_level = 'owner' WHERE id = ${dealId}`);

      const signal = new AbortController().signal;
      const deleted = await scrubInaccessible(db, {
        entityType: "deal",
        entityId: dealId,
        signal,
      });

      expect(deleted).toBe(1);

      const remaining = await db.select().from(notifications).where(sql`user_id = ${bob.id}::uuid`);
      expect(remaining).toHaveLength(0);
    });
  });

  it("keeps notifications for a user who still has access", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const bob = await seedUser(db);
      const dealId = await seedDeal(db, owner.id, "all");

      await db.insert(notifications).values([
        {
          userId: owner.id,
          type: "deal_followed_update",
          entityType: "deal",
          entityId: dealId,
          actorId: null,
          payload: {},
        },
        {
          userId: bob.id,
          type: "deal_followed_update",
          entityType: "deal",
          entityId: dealId,
          actorId: null,
          payload: {},
        },
      ]);

      await db.execute(sql`UPDATE deals SET visibility_level = 'owner' WHERE id = ${dealId}`);

      const signal = new AbortController().signal;
      const deleted = await scrubInaccessible(db, {
        entityType: "deal",
        entityId: dealId,
        signal,
      });

      expect(deleted).toBe(1);

      const ownerNotifs = await db
        .select()
        .from(notifications)
        .where(sql`user_id = ${owner.id}::uuid`);
      expect(ownerNotifs).toHaveLength(1);

      const bobNotifs = await db.select().from(notifications).where(sql`user_id = ${bob.id}::uuid`);
      expect(bobNotifs).toHaveLength(0);
    });
  });

  it("does not touch notifications for a different entity", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const bob = await seedUser(db);
      const dealId = await seedDeal(db, owner.id, "all");
      const otherDealId = await seedDeal(db, owner.id, "all");

      await db.insert(notifications).values({
        userId: bob.id,
        type: "deal_followed_update",
        entityType: "deal",
        entityId: otherDealId,
        actorId: null,
        payload: {},
      });

      await db.execute(sql`UPDATE deals SET visibility_level = 'owner' WHERE id = ${dealId}`);

      const signal = new AbortController().signal;
      const deleted = await scrubInaccessible(db, {
        entityType: "deal",
        entityId: dealId,
        signal,
      });

      expect(deleted).toBe(0);

      const bobNotifs = await db.select().from(notifications).where(sql`user_id = ${bob.id}::uuid`);
      expect(bobNotifs).toHaveLength(1);
    });
  });
});
