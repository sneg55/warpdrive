import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { resolveActivityVisibility } from "@/features/activities/visibility";
import { canSee } from "@/features/permissions/canSee";
import { activityVisibilitySql } from "./activityVisibilitySql";
import { actorOf, addActivity, addDeal, addOrg, addPerson, seedWorld } from "./search.test-helpers";
import { toVisibilityCtx } from "./visibilitySql";

describe("activityVisibilitySql parity with resolveActivityVisibility", () => {
  it("agrees on every activity in the fixture matrix for every actor", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const carol = actorOf((await seedUser(db)).id);
      const admin = actorOf((await seedUser(db, { isAdmin: true })).id, "admin");
      const visibleDeal = await addDeal(db, w, "Visible");
      const hiddenDeal = await addDeal(db, w, "Hidden", { ownerId: w.bob.id, visibility: "owner" });
      const deletedDeal = await addDeal(db, w, "Deleted");
      await db.execute(sql`UPDATE deals SET deleted_at = now() WHERE id = ${deletedDeal}`);
      const visiblePerson = await addPerson(db, w, "Visible");
      const hiddenPerson = await addPerson(db, w, "Hidden", {
        ownerId: w.bob.id,
        visibility: "owner",
      });
      const hiddenOrg = await addOrg(db, w, "Hidden", { ownerId: w.bob.id, visibility: "owner" });
      const visibleOrg = await addOrg(db, w, "Visible");

      const combos = [
        {},
        { dealId: visibleDeal },
        { dealId: hiddenDeal },
        { dealId: deletedDeal },
        { dealId: hiddenDeal, personId: visiblePerson },
        { personId: visiblePerson },
        { personId: hiddenPerson },
        { personId: hiddenPerson, orgId: visibleOrg },
        { orgId: visibleOrg },
        { orgId: hiddenOrg },
      ];
      for (const assigneeId of [w.alice.id, w.bob.id]) {
        for (const c of combos) await addActivity(db, w, "x", { assigneeId, ...c });
      }
      const withParticipant = await addActivity(db, w, "p", { assigneeId: w.bob.id });
      await db
        .insert(schema.activityParticipants)
        .values({ activityId: withParticipant, userId: carol.id });

      const all = await db.select().from(schema.activities);
      expect(all).toHaveLength(21);
      for (const actor of [actorOf(w.alice.id), actorOf(w.bob.id), carol, admin]) {
        const visible = new Set(
          (
            await db.execute(
              sql`SELECT a.id FROM activities a WHERE ${activityVisibilitySql(toVisibilityCtx(actor))}`,
            )
          ).rows.map((r) => (r as { id: string }).id),
        );
        for (const activity of all) {
          const resolved = await resolveActivityVisibility(
            db,
            activity,
            new AbortController().signal,
          );
          const expected = resolved !== null && canSee(actor, resolved);
          expect(visible.has(activity.id), `${actor.id} activity ${activity.id}`).toBe(expected);
        }
      }
    });
  });
});
