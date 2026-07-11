import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { notifications } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { scrubInaccessible } from "./scrub";

// Insert a deal with the given visibility level owned by the given user.
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
  // SECURITY: the core case - a user who lost access has their notifications deleted.
  it("deletes notifications for a user who lost access after visibility tightened", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const bob = await seedUser(db);
      // Start with all-visibility so bob can see it.
      const dealId = await seedDeal(db, owner.id, "all");

      // Insert a notification for bob referencing the deal.
      await db.insert(notifications).values({
        userId: bob.id,
        type: "deal_followed_update",
        entityType: "deal",
        entityId: dealId,
        actorId: owner.id,
        payload: {},
      });

      // Tighten visibility to owner-only: bob can no longer see it.
      await db.execute(sql`UPDATE deals SET visibility_level = 'owner' WHERE id = ${dealId}`);

      const signal = new AbortController().signal;
      const deleted = await scrubInaccessible(db, {
        entityType: "deal",
        entityId: dealId,
        signal,
      });

      // SECURITY assertion: the notification MUST have been deleted.
      expect(deleted).toBe(1);

      const remaining = await db.select().from(notifications).where(sql`user_id = ${bob.id}::uuid`);
      expect(remaining).toHaveLength(0);
    });
  });

  // A recipient who CAN still see the entity is NOT scrubbed.
  it("keeps notifications for a user who still has access", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const bob = await seedUser(db);
      const dealId = await seedDeal(db, owner.id, "all");

      // Insert notifications for both owner and bob.
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

      // Tighten to owner-only: bob loses access, owner keeps it.
      await db.execute(sql`UPDATE deals SET visibility_level = 'owner' WHERE id = ${dealId}`);

      const signal = new AbortController().signal;
      const deleted = await scrubInaccessible(db, {
        entityType: "deal",
        entityId: dealId,
        signal,
      });

      // Only bob's notification is deleted (1), not the owner's.
      expect(deleted).toBe(1);

      const ownerNotifs = await db
        .select()
        .from(notifications)
        .where(sql`user_id = ${owner.id}::uuid`);
      // The owner's notification MUST remain.
      expect(ownerNotifs).toHaveLength(1);

      const bobNotifs = await db.select().from(notifications).where(sql`user_id = ${bob.id}::uuid`);
      expect(bobNotifs).toHaveLength(0);
    });
  });

  // A notification for a DIFFERENT entityId is untouched by the scrub.
  it("does not touch notifications for a different entity", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const bob = await seedUser(db);
      const dealId = await seedDeal(db, owner.id, "all");
      const otherDealId = await seedDeal(db, owner.id, "all");

      // Notification for the OTHER deal (still all-visibility).
      await db.insert(notifications).values({
        userId: bob.id,
        type: "deal_followed_update",
        entityType: "deal",
        entityId: otherDealId,
        actorId: null,
        payload: {},
      });

      // Tighten the first deal: bob would lose access to it.
      await db.execute(sql`UPDATE deals SET visibility_level = 'owner' WHERE id = ${dealId}`);

      const signal = new AbortController().signal;
      const deleted = await scrubInaccessible(db, {
        entityType: "deal",
        entityId: dealId,
        signal,
      });

      // Nothing for this entity to scrub; the other-deal notification is untouched.
      expect(deleted).toBe(0);

      const bobNotifs = await db.select().from(notifications).where(sql`user_id = ${bob.id}::uuid`);
      expect(bobNotifs).toHaveLength(1);
    });
  });
});
