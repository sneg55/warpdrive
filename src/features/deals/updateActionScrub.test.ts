import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { notifications, visibilityGroupMembers, visibilityGroups } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { scrubInaccessible } from "@/features/notifications/scrub";
import { updateDeal } from "./dealActions";
import { adminSession, seedSettings } from "./dealMove.test-helpers";

type Db = Parameters<Parameters<typeof withTestDb>[0]>[0];

async function seedGroup(db: Db, name: string, memberIds: string[] = []): Promise<string> {
  const [group] = await db.insert(visibilityGroups).values({ name }).returning();
  if (group === undefined) throw new Error("seedGroup: insert returned no rows");
  if (memberIds.length > 0) {
    await db
      .insert(visibilityGroupMembers)
      .values(memberIds.map((userId) => ({ groupId: group.id, userId })));
  }
  return group.id;
}

async function seedGroupDeal(
  db: Db,
  ownerId: string,
  groupId: string,
): Promise<{ id: string; updatedAt: string }> {
  const { pipeline, stages } = await seedPipelineWithStages(db, ["Open"]);
  const stage = stages[0];
  if (stage === undefined) throw new Error("seedGroupDeal: no stage returned");
  const row = (
    await db.execute(sql`
      INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level, visibility_group_id)
      VALUES ('Group Deal', ${pipeline.id}, ${stage.id}, ${ownerId}, 'group', ${groupId}::uuid)
      RETURNING id, updated_at
    `)
  ).rows[0] as { id: string; updated_at: string } | undefined;
  if (row === undefined) throw new Error("seedGroupDeal: insert returned no rows");
  return { id: row.id, updatedAt: new Date(row.updated_at).toISOString() };
}

async function seedNotification(db: Db, userId: string, dealId: string): Promise<void> {
  await db.insert(notifications).values({
    userId,
    type: "deal_followed_update",
    entityType: "deal",
    entityId: dealId,
    actorId: null,
    payload: {},
  });
}

describe("updateDeal + scrubInaccessible: visibility group change removes stale notifications", () => {
  it("scrubs notifications for a user who loses access when visibilityGroupId narrows", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db, "group");

      const owner = await seedUser(db, { isAdmin: true });
      const userB = await seedUser(db);

      const groupG = await seedGroup(db, `G-${Date.now()}`, [owner.id, userB.id]);
      const groupH = await seedGroup(db, `H-${Date.now()}`, [owner.id]);

      const deal = await seedGroupDeal(db, owner.id, groupG);
      await seedNotification(db, userB.id, deal.id);

      const before = await db
        .select()
        .from(notifications)
        .where(sql`user_id = ${userB.id}::uuid AND entity_id = ${deal.id}::uuid`);
      expect(before).toHaveLength(1);

      const session = {
        ...adminSession(owner.id),
        groupIds: new Set([groupG, groupH]),
      };
      const result = await updateDeal(
        db,
        session,
        {
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt,
          visibilityGroupId: groupH,
        },
        new AbortController().signal,
      );
      expect(result.ok).toBe(true);
      if (result.ok === false) return;

      const deleted = await scrubInaccessible(db, {
        entityType: "deal",
        entityId: deal.id,
        signal: new AbortController().signal,
      });
      expect(deleted).toBe(1);

      const after = await db
        .select()
        .from(notifications)
        .where(sql`user_id = ${userB.id}::uuid AND entity_id = ${deal.id}::uuid`);
      expect(after).toHaveLength(0);
    });
  });

  it("keeps notifications for a user who is already in the new group", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db, "group");

      const owner = await seedUser(db, { isAdmin: true });
      const userInH = await seedUser(db);
      const userBNotInH = await seedUser(db);

      const groupG = await seedGroup(db, `G2-${Date.now()}`, [
        owner.id,
        userInH.id,
        userBNotInH.id,
      ]);
      const groupH = await seedGroup(db, `H2-${Date.now()}`, [owner.id, userInH.id]);

      const deal = await seedGroupDeal(db, owner.id, groupG);
      await seedNotification(db, userInH.id, deal.id);
      await seedNotification(db, userBNotInH.id, deal.id);

      const session = {
        ...adminSession(owner.id),
        groupIds: new Set([groupG, groupH]),
      };
      const result = await updateDeal(
        db,
        session,
        {
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt,
          visibilityGroupId: groupH,
        },
        new AbortController().signal,
      );
      expect(result.ok).toBe(true);

      const deleted = await scrubInaccessible(db, {
        entityType: "deal",
        entityId: deal.id,
        signal: new AbortController().signal,
      });
      expect(deleted).toBe(1);

      const inHRows = await db
        .select()
        .from(notifications)
        .where(sql`user_id = ${userInH.id}::uuid AND entity_id = ${deal.id}::uuid`);
      expect(inHRows).toHaveLength(1);

      const notInHRows = await db
        .select()
        .from(notifications)
        .where(sql`user_id = ${userBNotInH.id}::uuid AND entity_id = ${deal.id}::uuid`);
      expect(notInHRows).toHaveLength(0);
    });
  });

  it("rejects a visibilityGroupId change to a group the actor is NOT a member of", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db, "group");

      const owner = await seedUser(db, { isAdmin: true });
      const userB = await seedUser(db);

      const groupG = await seedGroup(db, `G3-${Date.now()}`, [owner.id, userB.id]);
      const groupForbidden = await seedGroup(db, `F3-${Date.now()}`, []);

      const deal = await seedGroupDeal(db, owner.id, groupG);
      await seedNotification(db, userB.id, deal.id);

      const session = {
        ...adminSession(owner.id),
        groupIds: new Set([groupG]),
      };
      const result = await updateDeal(
        db,
        session,
        {
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt,
          visibilityGroupId: groupForbidden,
        },
        new AbortController().signal,
      );

      expect(result.ok).toBe(false);
      if (result.ok === true) return;
      expect(result.error.id).toBe("E_PERM_001");

      const groupRow = (
        await db.execute(sql`SELECT visibility_group_id FROM deals WHERE id = ${deal.id}::uuid`)
      ).rows[0] as { visibility_group_id: string } | undefined;
      expect(groupRow?.visibility_group_id).toBe(groupG);

      const bRows = await db
        .select()
        .from(notifications)
        .where(sql`user_id = ${userB.id}::uuid AND entity_id = ${deal.id}::uuid`);
      expect(bRows).toHaveLength(1);
    });
  });
});
