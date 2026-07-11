// @vitest-environment node
// Integration tests for the stats tRPC router (dashboard procedure).
// Real Postgres via withTestDb; no DB mocks.

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { createCaller } from "@/server/trpc/root";

// Build a PermSetUser-compatible actor from a seeded user row.
function makeActor(u: { id: string; isAdmin: boolean; isActive: boolean }): PermSetUser {
  return {
    id: u.id,
    type: u.isAdmin ? ("admin" as const) : ("regular" as const),
    isActive: u.isActive,
    flags: new Set<PermissionFlagKey>(),
    groupIds: new Set<string>(),
  };
}

describe("stats tRPC router", () => {
  it("(a) forces regular user to 'me' scope even when 'all' is requested and returns won count", async () => {
    await withTestDb(async (db) => {
      const userRow = await seedUser(db, { isAdmin: false });
      const actor = makeActor(userRow);

      // Seed a pipeline with one stage.
      const { pipeline, stages } = await seedPipelineWithStages(db, ["Qualify"]);
      const stage = stages[0];
      if (!stage) throw new Error("no stage");

      // Seed settings.default_pipeline_id so we can pass explicit pipelineId in the call.
      // (The test passes pipelineId explicitly anyway, but insert settings to ensure the row exists.)
      await db.execute(sql`
        INSERT INTO settings (id, default_pipeline_id)
        VALUES (true, ${pipeline.id})
        ON CONFLICT (id) DO UPDATE SET default_pipeline_id = EXCLUDED.default_pipeline_id
      `);

      // Seed a won deal owned by the actor with all-visibility so it is always visible.
      await db.execute(sql`
        INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level, status)
        VALUES ('Won deal', ${pipeline.id}, ${stage.id}, ${userRow.id}::uuid, 'all', 'won')
      `);

      const caller = createCaller({
        db,
        session: { userId: userRow.id, sessionId: "test-session" },
        actor,
      });

      const out = await caller.stats.dashboard({
        pipelineId: pipeline.id,
        ownerScope: "all",
        from: "2026-01-01",
        to: "2026-12-31",
      });

      // A regular user without stats.viewOthers must be downgraded to 'me'.
      expect(out.effectiveOwnerScope).toBe("me");
      // The actor's own won deal must be counted.
      expect(out.dealPerformance.won.count).toBe(1);
    });
  });

  it("(b) rejects a pipeline whose visibility_group_id is not in the actor's groups", async () => {
    await withTestDb(async (db) => {
      const userRow = await seedUser(db, { isAdmin: false });
      const actor = makeActor(userRow);

      // Create a visibility group and a pipeline restricted to it (actor is NOT a member).
      const groupRow = (
        await db.execute(sql`
          INSERT INTO visibility_groups (name) VALUES ('restricted-group') RETURNING id
        `)
      ).rows[0] as { id: string } | undefined;
      if (!groupRow) throw new Error("visibility_group insert failed");

      const { pipeline } = await seedPipelineWithStages(db, ["Stage 1"], {
        visibilityGroupId: groupRow.id,
      });

      const caller = createCaller({
        db,
        session: { userId: userRow.id, sessionId: "test-session" },
        actor,
      });

      // Expect an AppError with E_STATS_001 because the pipeline is restricted.
      await expect(
        caller.stats.dashboard({
          pipelineId: pipeline.id,
          ownerScope: "me",
          from: "2026-01-01",
          to: "2026-12-31",
        }),
      ).rejects.toMatchObject({ cause: { id: ERROR_IDS.STATS_PIPELINE_NOT_VISIBLE } });
    });
  });

  it("(b-positive) admin can access a restricted pipeline without error", async () => {
    await withTestDb(async (db) => {
      const adminRow = await seedUser(db, { isAdmin: true });
      const actor = makeActor(adminRow);

      // Restricted pipeline (admin bypasses restriction).
      const groupRow = (
        await db.execute(sql`
          INSERT INTO visibility_groups (name) VALUES ('admin-test-group') RETURNING id
        `)
      ).rows[0] as { id: string } | undefined;
      if (!groupRow) throw new Error("visibility_group insert failed");

      const { pipeline } = await seedPipelineWithStages(db, ["Stage A"], {
        visibilityGroupId: groupRow.id,
      });

      const caller = createCaller({
        db,
        session: { userId: adminRow.id, sessionId: "test-session-admin" },
        actor,
      });

      // Admin should NOT throw.
      const out = await caller.stats.dashboard({
        pipelineId: pipeline.id,
        ownerScope: "me",
        from: "2026-01-01",
        to: "2026-12-31",
      });
      expect(out.effectiveOwnerScope).toBe("me");
    });
  });

  it("(c) omitting pipelineId aggregates deal performance across all visible pipelines", async () => {
    await withTestDb(async (db) => {
      const userRow = await seedUser(db, { isAdmin: false });
      const actor = makeActor(userRow);

      const p1 = await seedPipelineWithStages(db, ["Q1"]);
      const p2 = await seedPipelineWithStages(db, ["Q2"]);
      const s1 = p1.stages[0];
      const s2 = p2.stages[0];
      if (!s1 || !s2) throw new Error("no stage");

      // One won deal in EACH pipeline, both visible to the actor.
      await db.execute(sql`
        INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level, status, value)
        VALUES ('Won 1', ${p1.pipeline.id}, ${s1.id}, ${userRow.id}::uuid, 'all', 'won', 100)
      `);
      await db.execute(sql`
        INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level, status, value)
        VALUES ('Won 2', ${p2.pipeline.id}, ${s2.id}, ${userRow.id}::uuid, 'all', 'won', 200)
      `);

      const caller = createCaller({
        db,
        session: { userId: userRow.id, sessionId: "test-session-all" },
        actor,
      });

      // Omit pipelineId => "All pipelines": Deal Performance must SUM both pipelines.
      const out = await caller.stats.dashboard({
        ownerScope: "me",
        from: "2026-01-01",
        to: "2026-12-31",
      });

      expect(out.dealPerformance.won.count).toBe(2);
      expect(out.dealPerformance.won.value).toBe("300.00");
      // Funnel and stage sums are inherently per-pipeline, so they are empty here.
      expect(out.funnel).toEqual([]);
      expect(out.stageSums).toEqual([]);
    });
  });

  it("(c-archived) 'All pipelines' aggregate excludes deals in archived pipelines", async () => {
    await withTestDb(async (db) => {
      const userRow = await seedUser(db, { isAdmin: false });
      const actor = makeActor(userRow);

      const live = await seedPipelineWithStages(db, ["Live"]);
      const archived = await seedPipelineWithStages(db, ["Old"], { isArchived: true });
      const liveStage = live.stages[0];
      const archivedStage = archived.stages[0];
      if (!liveStage || !archivedStage) throw new Error("no stage");

      // One won deal in a LIVE pipeline and one in an ARCHIVED pipeline, both visible.
      await db.execute(sql`
        INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level, status, value)
        VALUES ('Live won', ${live.pipeline.id}, ${liveStage.id}, ${userRow.id}::uuid, 'all', 'won', 100)
      `);
      await db.execute(sql`
        INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level, status, value)
        VALUES ('Archived won', ${archived.pipeline.id}, ${archivedStage.id}, ${userRow.id}::uuid, 'all', 'won', 999)
      `);

      const caller = createCaller({
        db,
        session: { userId: userRow.id, sessionId: "test-session-arch-agg" },
        actor,
      });

      // "All pipelines": only the live pipeline's deal should count (archived pipelines are
      // hidden from the dropdown and rejected individually, so they must not inflate the aggregate).
      const out = await caller.stats.dashboard({
        ownerScope: "me",
        from: "2026-01-01",
        to: "2026-12-31",
      });

      expect(out.dealPerformance.won.count).toBe(1);
      expect(out.dealPerformance.won.value).toBe("100.00");
    });
  });

  it("(a-archived) rejects an archived pipeline even for an admin", async () => {
    await withTestDb(async (db) => {
      const adminRow = await seedUser(db, { isAdmin: true });
      const actor = makeActor(adminRow);

      // Public (null group) but archived pipeline: must be treated as not visible.
      const { pipeline } = await seedPipelineWithStages(db, ["Stage X"], {
        isArchived: true,
      });

      const caller = createCaller({
        db,
        session: { userId: adminRow.id, sessionId: "test-session-archived" },
        actor,
      });

      await expect(
        caller.stats.dashboard({
          pipelineId: pipeline.id,
          ownerScope: "me",
          from: "2026-01-01",
          to: "2026-12-31",
        }),
      ).rejects.toMatchObject({ cause: { id: ERROR_IDS.STATS_PIPELINE_NOT_VISIBLE } });
    });
  });
});
