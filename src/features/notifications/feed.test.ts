import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { notifications } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { getFeed, getUnreadCount, markAllRead, markRead } from "./feed";

// Convert a raw users row (isAdmin: boolean) to an AuthUser for feed functions.
// No group memberships; tests that need group membership must add them separately.
function toAuthUser(row: Awaited<ReturnType<typeof seedUser>>): AuthUser {
  return {
    id: row.id,
    type: row.isAdmin ? "admin" : "regular",
    isActive: row.isActive,
    groupIds: new Set<string>(),
  };
}

// Insert a deal with owner-level visibility owned by the given user.
async function seedOwnerDeal(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  ownerId: string,
): Promise<string> {
  const { pipeline, stages } = await seedPipelineWithStages(db, ["Open"]);
  const stage = stages[0];
  if (stage === undefined) throw new Error("seedOwnerDeal: no stage returned");
  const row = (
    await db.execute(sql`
      INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level)
      VALUES ('Owner Deal', ${pipeline.id}, ${stage.id}, ${ownerId}, 'owner')
      RETURNING id
    `)
  ).rows[0] as { id: string } | undefined;
  if (row === undefined) throw new Error("seedOwnerDeal: insert returned no rows");
  return row.id;
}

// Insert a deal with all-level visibility owned by the given user.
async function seedAllDeal(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  ownerId: string,
): Promise<string> {
  const { pipeline, stages } = await seedPipelineWithStages(db, ["Open"]);
  const stage = stages[0];
  if (stage === undefined) throw new Error("seedAllDeal: no stage returned");
  const row = (
    await db.execute(sql`
      INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level)
      VALUES ('Public Deal', ${pipeline.id}, ${stage.id}, ${ownerId}, 'all')
      RETURNING id
    `)
  ).rows[0] as { id: string } | undefined;
  if (row === undefined) throw new Error("seedAllDeal: insert returned no rows");
  return row.id;
}

// SECURITY: core red-first test. A notification addressed to alice referencing a deal
// owned by bob with owner-only visibility (alice cannot see it) must be ABSENT from
// getFeed and excluded from getUnreadCount. Its payload ('leaky title') must not appear.
describe("notification feed read-time filtering", () => {
  it("hides a notification whose referenced deal the viewer cannot see", async () => {
    await withTestDb(async (db) => {
      const aliceRow = await seedUser(db);
      const bobRow = await seedUser(db);
      const alice = toAuthUser(aliceRow);
      // Bob owns the deal with owner-only visibility. Alice cannot see it.
      const dealId = await seedOwnerDeal(db, bobRow.id);

      // Insert a stale notification directly (bypassing the producer's gate) to
      // simulate visibility changing after the row was written.
      await db.insert(notifications).values({
        userId: alice.id,
        type: "deal_followed_update",
        entityType: "deal",
        entityId: dealId,
        actorId: bobRow.id,
        payload: { title: "leaky title" },
      });

      const ctrl = new AbortController();
      const feed = await getFeed(db, alice, 50, ctrl.signal);

      // SECURITY assertion: the row must not appear at all.
      expect(feed.find((n) => n.entityId === dealId)).toBeUndefined();
      // The leaky payload must not be present in any returned item.
      const leaky = feed.find(
        (n) =>
          typeof n.payload === "object" &&
          n.payload !== null &&
          "title" in n.payload &&
          n.payload.title === "leaky title",
      );
      expect(leaky).toBeUndefined();
      // Unread count must also exclude the hidden row.
      expect(await getUnreadCount(db, alice, ctrl.signal)).toBe(0);
    });
  });

  it("shows a notification for a deal the viewer can see, counts as unread", async () => {
    await withTestDb(async (db) => {
      const aliceRow = await seedUser(db);
      const alice = toAuthUser(aliceRow);
      // Alice owns the deal (owner visibility): she can see it.
      const dealId = await seedAllDeal(db, aliceRow.id);

      await db.insert(notifications).values({
        userId: alice.id,
        type: "deal_won",
        entityType: "deal",
        entityId: dealId,
        actorId: null,
        payload: { note: "visible" },
      });

      const ctrl = new AbortController();
      const feed = await getFeed(db, alice, 50, ctrl.signal);
      expect(feed.find((n) => n.entityId === dealId)).toBeDefined();
      expect(await getUnreadCount(db, alice, ctrl.signal)).toBe(1);
    });
  });

  it("markAllRead drops unread count to zero", async () => {
    await withTestDb(async (db) => {
      const aliceRow = await seedUser(db);
      const alice = toAuthUser(aliceRow);
      const dealId = await seedAllDeal(db, aliceRow.id);

      await db.insert(notifications).values({
        userId: alice.id,
        type: "deal_won",
        entityType: "deal",
        entityId: dealId,
        actorId: null,
        payload: {},
      });

      const ctrl = new AbortController();
      expect(await getUnreadCount(db, alice, ctrl.signal)).toBe(1);
      await markAllRead(db, alice, ctrl.signal);
      expect(await getUnreadCount(db, alice, ctrl.signal)).toBe(0);
    });
  });

  it("markRead only affects the caller's own row: alice cannot mark bob's notification read", async () => {
    await withTestDb(async (db) => {
      const aliceRow = await seedUser(db);
      const bobRow = await seedUser(db);
      const alice = toAuthUser(aliceRow);
      const bob = toAuthUser(bobRow);
      // All-visibility deal so both users have access if they had notifications.
      const dealId = await seedAllDeal(db, bobRow.id);

      // Insert bob's notification directly.
      const [bobNotif] = await db
        .insert(notifications)
        .values({
          userId: bob.id,
          type: "deal_won",
          entityType: "deal",
          entityId: dealId,
          actorId: null,
          payload: {},
        })
        .returning({ id: notifications.id });
      if (bobNotif === undefined) throw new Error("bob notification insert failed");

      const ctrl = new AbortController();
      // Alice tries to mark bob's notification read: the user_id guard must block it.
      await markRead(db, alice, bobNotif.id, ctrl.signal);

      // Bob's row must still be unread.
      expect(await getUnreadCount(db, bob, ctrl.signal)).toBe(1);
    });
  });

  it("null-entity notification always appears in the feed", async () => {
    await withTestDb(async (db) => {
      const aliceRow = await seedUser(db);
      const alice = toAuthUser(aliceRow);

      const [notif] = await db
        .insert(notifications)
        .values({
          userId: alice.id,
          type: "activity_reminder",
          entityType: null,
          entityId: null,
          actorId: null,
          payload: { note: "system" },
        })
        .returning({ id: notifications.id });
      if (notif === undefined) throw new Error("null-entity insert failed");

      const ctrl = new AbortController();
      const feed = await getFeed(db, alice, 50, ctrl.signal);
      expect(feed.find((n) => n.id === notif.id)).toBeDefined();
      expect(await getUnreadCount(db, alice, ctrl.signal)).toBe(1);
    });
  });

  it("banding: a notification created today is banded 'today'", async () => {
    await withTestDb(async (db) => {
      const aliceRow = await seedUser(db);
      const alice = toAuthUser(aliceRow);

      await db.insert(notifications).values({
        userId: alice.id,
        type: "activity_reminder",
        entityType: null,
        entityId: null,
        actorId: null,
        payload: {},
      });

      const ctrl = new AbortController();
      const feed = await getFeed(db, alice, 50, ctrl.signal);
      expect(feed.length).toBeGreaterThan(0);
      const item = feed[0];
      expect(item?.band).toBe("today");
    });
  });
});
