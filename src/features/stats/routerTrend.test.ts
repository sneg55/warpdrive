// @vitest-environment node
// The dashboard payload must carry the won-deal trend. Kept out of router.test.ts, which is
// already at the file-size ceiling.
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { HydratedActor } from "@/server/hydrateActor";
import { createCaller } from "@/server/trpc/root";

function makeActor(u: { id: string; isAdmin: boolean; isActive: boolean }): HydratedActor {
  return {
    id: u.id,
    type: u.isAdmin ? ("admin" as const) : ("regular" as const),
    isActive: u.isActive,
    name: "Test User",
    email: "test@example.com",
    avatarUrl: null,
    flags: new Set<PermissionFlagKey>(),
    groupIds: new Set<string>(),
  };
}

describe("stats.dashboard won trend", () => {
  it("returns one point per month of the requested range with the win in its own month", async () => {
    await withTestDb(async (db) => {
      const userRow = await seedUser(db, { isAdmin: false });
      const actor = makeActor(userRow);
      const { pipeline, stages } = await seedPipelineWithStages(db, ["Qualify"]);
      const stage = stages[0];
      if (!stage) throw new Error("no stage");

      await db.execute(sql`
        INSERT INTO settings (id, default_pipeline_id)
        VALUES (true, ${pipeline.id})
        ON CONFLICT (id) DO UPDATE SET default_pipeline_id = EXCLUDED.default_pipeline_id
      `);
      await db.execute(sql`
        INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level, status, value, won_time)
        VALUES ('Won deal', ${pipeline.id}, ${stage.id}, ${userRow.id}::uuid, 'all', 'won', 4200, '2026-06-15T12:00:00Z')
      `);

      const caller = createCaller({
        db,
        session: { userId: userRow.id, sessionId: "test-session" },
        actor,
      });

      const out = await caller.stats.dashboard({
        pipelineId: pipeline.id,
        ownerScope: "me",
        from: "2026-01-01",
        to: "2026-12-31",
      });

      expect(out.wonTrend).toHaveLength(12);
      expect(out.wonTrend.find((p) => p.month === "2026-06")).toEqual({
        month: "2026-06",
        count: 1,
        value: "4200.00",
      });
      expect(out.wonTrend.filter((p) => p.count === 0)).toHaveLength(11);
    });
  });
});
