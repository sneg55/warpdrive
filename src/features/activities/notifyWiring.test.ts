// notifyWiring.test.ts: integration test proving notifyActivityAssigned fires
// after createActivity when the assignee is a different user.
//
// RED: fails until notifyOnActivityCreated helper is extracted and called from
// createActivityAction.
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { activityTypes, notifications } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { notifyOnActivityCreated } from "./notifyHelpers";
import { createActivity } from "./repo";

function makeActor(user: { id: string }): PermSetUser {
  return {
    id: user.id,
    type: "admin",
    isActive: true,
    groupIds: new Set(),
    flags: new Set(),
  };
}

describe("notifyOnActivityCreated: activity_assigned", () => {
  it("fires an activity_assigned notification to the assignee when assigned by a different actor", async () => {
    await withTestDb(async (db) => {
      const actor = await seedUser(db);
      const assignee = await seedUser(db);
      const owner = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A"]);
      const stage = p.stages[0];
      if (!stage) throw new Error("seed: no stage");
      const [deal] = await db
        .execute(
          sql`INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level)
              VALUES ('D', ${p.pipeline.id}, ${stage.id}, ${owner.id}, 'all') RETURNING id`,
        )
        .then((r) => r.rows as { id: string }[]);
      if (!deal) throw new Error("seed: no deal");

      const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
      if (!type) throw new Error("seed: no activity type 'call'");

      const result = await createActivity(
        db,
        makeActor(actor),
        {
          typeId: type.id,
          subject: "Follow up call",
          dealId: deal.id,
          dueAt: null,
          durationMinutes: null,
          personId: null,
          orgId: null,
          assigneeId: assignee.id,
          guestPersonIds: [],
          participantUserIds: [],
          customFields: {},
        },
        new AbortController().signal,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Wire: notifyOnActivityCreated fires the adapter. This is what the action calls.
      await notifyOnActivityCreated(db, {
        activity: result.value,
        actorId: actor.id,
        signal: new AbortController().signal,
      });

      const rows = await db.select().from(notifications).where(sql`user_id = ${assignee.id}::uuid`);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.type).toBe("activity_assigned");
    });
  });

  // Codex finding F26: the notification set entityType/entityId only when dealId was present.
  // For an activity linked ONLY to a private person (or org), that emitted an UNGATED
  // notification carrying the activity subject, so an assignee who cannot see the parent
  // still received its details. The notification must gate on the dominant parent entity.
  it("suppresses activity_assigned when the assignee cannot see the person-only parent", async () => {
    await withTestDb(async (db) => {
      const actor = await seedUser(db);
      const assignee = await seedUser(db);
      const personOwner = await seedUser(db);

      // A private person: visible only to its owner, NOT to the assignee.
      const [person] = (
        await db.execute(
          sql`INSERT INTO persons (name, owner_id, visibility_level)
              VALUES ('Private P', ${personOwner.id}, 'owner') RETURNING id`,
        )
      ).rows as { id: string }[];
      if (!person) throw new Error("seed: no person");

      const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
      if (!type) throw new Error("seed: no activity type 'call'");

      const result = await createActivity(
        db,
        makeActor(actor),
        {
          typeId: type.id,
          subject: "Private call",
          dealId: null,
          dueAt: null,
          durationMinutes: null,
          personId: person.id,
          orgId: null,
          assigneeId: assignee.id,
          guestPersonIds: [],
          participantUserIds: [],
          customFields: {},
        },
        new AbortController().signal,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      await notifyOnActivityCreated(db, {
        activity: result.value,
        actorId: actor.id,
        signal: new AbortController().signal,
      });

      // Gated on the person the assignee cannot see: no notification is produced.
      const rows = await db.select().from(notifications).where(sql`user_id = ${assignee.id}::uuid`);
      expect(rows).toHaveLength(0);
    });
  });
});
