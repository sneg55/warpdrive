import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { dealFollowers, notifications } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { notifyActivityAssigned, notifyDealFollowedUpdate, notifyDealWonLost } from "./wire";

// Insert a deal and return its id. visibilityLevel: 'all' means any user can see it.
async function seedDeal(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  opts: { ownerId: string; visibilityLevel: "all" | "owner" },
): Promise<string> {
  const { pipeline, stages } = await seedPipelineWithStages(db, ["Open"]);
  const stage = stages[0];
  if (stage === undefined) throw new Error("seedDeal: no stage returned");
  const row = (
    await db.execute(sql`
      INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level)
      VALUES ('Test Deal', ${pipeline.id}, ${stage.id}, ${opts.ownerId}, ${opts.visibilityLevel})
      RETURNING id
    `)
  ).rows[0] as { id: string } | undefined;
  if (row === undefined) throw new Error("seedDeal: insert returned no rows");
  return row.id;
}

async function addFollower(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  dealId: string,
  userId: string,
): Promise<void> {
  await db.insert(dealFollowers).values({ dealId, userId });
}

describe("notifyDealFollowedUpdate", () => {
  it("notifies followers except the actor", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const follower = await seedUser(db);
      const dealId = await seedDeal(db, { ownerId: owner.id, visibilityLevel: "all" });
      await addFollower(db, dealId, owner.id);
      await addFollower(db, dealId, follower.id);

      await notifyDealFollowedUpdate(db, {
        dealId,
        actorId: owner.id,
        changeSummary: "stage changed",
        signal: new AbortController().signal,
      });

      const ownerRows = await db
        .select()
        .from(notifications)
        .where(sql`user_id = ${owner.id}::uuid`);
      const followerRows = await db
        .select()
        .from(notifications)
        .where(sql`user_id = ${follower.id}::uuid`);

      expect(ownerRows).toHaveLength(0);
      expect(followerRows).toHaveLength(1);
      expect(followerRows[0]?.type).toBe("deal_followed_update");
    });
  });

  it("suppresses notification when follower cannot see the deal (owner-only visibility)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const actor = await seedUser(db);
      const follower = await seedUser(db);
      // owner-level visibility: only the owner can see it; follower and actor cannot
      const dealId = await seedDeal(db, { ownerId: owner.id, visibilityLevel: "owner" });
      await addFollower(db, dealId, follower.id);

      await notifyDealFollowedUpdate(db, {
        dealId,
        actorId: actor.id,
        changeSummary: "field updated",
        signal: new AbortController().signal,
      });

      // follower cannot see the deal: producer suppresses, 0 rows
      const followerRows = await db
        .select()
        .from(notifications)
        .where(sql`user_id = ${follower.id}::uuid`);
      expect(followerRows).toHaveLength(0);
    });
  });
});

describe("notifyDealWonLost", () => {
  it("notifies followers and owner excluding the actor, type deal_won", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const follower = await seedUser(db);
      const actor = await seedUser(db);
      const dealId = await seedDeal(db, { ownerId: owner.id, visibilityLevel: "all" });
      await addFollower(db, dealId, follower.id);

      await notifyDealWonLost(db, {
        dealId,
        status: "won",
        actorId: actor.id,
        signal: new AbortController().signal,
      });

      const ownerRows = await db
        .select()
        .from(notifications)
        .where(sql`user_id = ${owner.id}::uuid`);
      const followerRows = await db
        .select()
        .from(notifications)
        .where(sql`user_id = ${follower.id}::uuid`);
      const actorRows = await db
        .select()
        .from(notifications)
        .where(sql`user_id = ${actor.id}::uuid`);

      expect(ownerRows).toHaveLength(1);
      expect(ownerRows[0]?.type).toBe("deal_won");
      expect(followerRows).toHaveLength(1);
      expect(followerRows[0]?.type).toBe("deal_won");
      expect(actorRows).toHaveLength(0);
    });
  });

  it("deduplicates when the owner is also a follower", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const actor = await seedUser(db);
      const dealId = await seedDeal(db, { ownerId: owner.id, visibilityLevel: "all" });
      // owner is also a follower
      await addFollower(db, dealId, owner.id);

      await notifyDealWonLost(db, {
        dealId,
        status: "won",
        actorId: actor.id,
        signal: new AbortController().signal,
      });

      const ownerRows = await db
        .select()
        .from(notifications)
        .where(sql`user_id = ${owner.id}::uuid`);
      // deduped: owner-as-follower and owner-as-owner => exactly 1 row
      expect(ownerRows).toHaveLength(1);
    });
  });
});

describe("notifyActivityAssigned", () => {
  it("notifies the assignee when assigned by a different actor", async () => {
    await withTestDb(async (db) => {
      const actor = await seedUser(db);
      const assignee = await seedUser(db);
      const owner = await seedUser(db);
      const dealId = await seedDeal(db, { ownerId: owner.id, visibilityLevel: "all" });

      await notifyActivityAssigned(db, {
        activityId: "00000000-0000-0000-0000-000000000001",
        assigneeId: assignee.id,
        actorId: actor.id,
        entityType: "deal",
        entityId: dealId,
        subject: "Call",
        signal: new AbortController().signal,
      });

      const rows = await db.select().from(notifications).where(sql`user_id = ${assignee.id}::uuid`);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.type).toBe("activity_assigned");
    });
  });

  it("does not notify when actor assigns to themselves (self-assign)", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const owner = await seedUser(db);
      const dealId = await seedDeal(db, { ownerId: owner.id, visibilityLevel: "all" });

      await notifyActivityAssigned(db, {
        activityId: "00000000-0000-0000-0000-000000000002",
        assigneeId: user.id,
        actorId: user.id,
        entityType: "deal",
        entityId: dealId,
        subject: "Call",
        signal: new AbortController().signal,
      });

      const rows = await db.select().from(notifications).where(sql`user_id = ${user.id}::uuid`);
      expect(rows).toHaveLength(0);
    });
  });
});
