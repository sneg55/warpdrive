// @vitest-environment node

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { HydratedActor } from "@/server/hydrateActor";
import { createCaller } from "@/server/trpc/root";

function makeActor(
  u: { id: string; isAdmin: boolean; isActive: boolean },
  flags: PermissionFlagKey[] = [],
): HydratedActor {
  return {
    id: u.id,
    type: u.isAdmin ? ("admin" as const) : ("regular" as const),
    isActive: u.isActive,
    name: "Test User",
    email: "test@example.com",
    avatarUrl: null,
    flags: new Set<PermissionFlagKey>(flags),
    groupIds: new Set<string>(),
  };
}

describe("stats tRPC router", () => {
  it("(a) forces regular user to 'me' scope even when 'all' is requested and returns won count", async () => {
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
        INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level, status, won_time)
        VALUES ('Won deal', ${pipeline.id}, ${stage.id}, ${userRow.id}::uuid, 'all', 'won', '2026-06-01')
      `);

      const caller = createCaller({
        db,
        session: { userId: userRow.id, sessionId: "test-session" },
        actor,
      });

      const out = await caller.stats.dashboard({
        pipelineId: pipeline.id,
        ownerScope: { kind: "all" },
        from: "2026-01-01",
        to: "2026-12-31",
      });

      expect(out.effectiveOwnerScope).toEqual({ kind: "me" });
      expect(out.dealPerformance.won.count).toBe(1);
    });
  });

  it("(b) rejects a pipeline whose visibility_group_id is not in the actor's groups", async () => {
    await withTestDb(async (db) => {
      const userRow = await seedUser(db, { isAdmin: false });
      const actor = makeActor(userRow);

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

      await expect(
        caller.stats.dashboard({
          pipelineId: pipeline.id,
          ownerScope: { kind: "me" },
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

      const out = await caller.stats.dashboard({
        pipelineId: pipeline.id,
        ownerScope: { kind: "me" },
        from: "2026-01-01",
        to: "2026-12-31",
      });
      expect(out.effectiveOwnerScope).toEqual({ kind: "me" });
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

      await db.execute(sql`
        INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level, status, value, won_time)
        VALUES ('Won 1', ${p1.pipeline.id}, ${s1.id}, ${userRow.id}::uuid, 'all', 'won', 100, '2026-06-01')
      `);
      await db.execute(sql`
        INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level, status, value, won_time)
        VALUES ('Won 2', ${p2.pipeline.id}, ${s2.id}, ${userRow.id}::uuid, 'all', 'won', 200, '2026-06-01')
      `);

      const caller = createCaller({
        db,
        session: { userId: userRow.id, sessionId: "test-session-all" },
        actor,
      });

      const out = await caller.stats.dashboard({
        ownerScope: { kind: "me" },
        from: "2026-01-01",
        to: "2026-12-31",
      });

      expect(out.dealPerformance.won.count).toBe(2);
      expect(out.dealPerformance.won.value).toBe("300.00");
      expect(out.funnel).toHaveLength(1);
      expect(out.funnel[0]?.name).toBe("Stage 1");
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

      await db.execute(sql`
        INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level, status, value, won_time)
        VALUES ('Live won', ${live.pipeline.id}, ${liveStage.id}, ${userRow.id}::uuid, 'all', 'won', 100, '2026-06-01')
      `);
      await db.execute(sql`
        INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level, status, value, won_time)
        VALUES ('Archived won', ${archived.pipeline.id}, ${archivedStage.id}, ${userRow.id}::uuid, 'all', 'won', 999, '2026-06-01')
      `);

      const caller = createCaller({
        db,
        session: { userId: userRow.id, sessionId: "test-session-arch-agg" },
        actor,
      });

      const out = await caller.stats.dashboard({
        ownerScope: { kind: "me" },
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
          ownerScope: { kind: "me" },
          from: "2026-01-01",
          to: "2026-12-31",
        }),
      ).rejects.toMatchObject({ cause: { id: ERROR_IDS.STATS_PIPELINE_NOT_VISIBLE } });
    });
  });

  it("(d) 'All pipelines' never surfaces stage names from a restricted pipeline", async () => {
    await withTestDb(async (db) => {
      const userRow = await seedUser(db, { isAdmin: false });
      const actor = makeActor(userRow);

      const groupRow = (
        await db.execute(sql`
          INSERT INTO visibility_groups (name) VALUES ('secret-group') RETURNING id
        `)
      ).rows[0] as { id: string } | undefined;
      if (!groupRow) throw new Error("visibility_group insert failed");

      await seedPipelineWithStages(db, ["Open"]);
      await seedPipelineWithStages(db, ["Intake", "Review", "Secret Diligence"], {
        visibilityGroupId: groupRow.id,
      });

      const caller = createCaller({
        db,
        session: { userId: userRow.id, sessionId: "test-session-d" },
        actor,
      });

      const out = await caller.stats.dashboard({
        pipelineId: null,
        ownerScope: { kind: "me" },
        from: "2026-01-01",
        to: "2026-12-31",
      });

      const names = out.funnel.map((f) => f.name).join("|");
      expect(names).not.toContain("Secret Diligence");
      expect(out.funnel).toHaveLength(1);
    });
  });

  it("(d-visible) 'All pipelines' returns a funnel instead of an empty panel", async () => {
    await withTestDb(async (db) => {
      const userRow = await seedUser(db, { isAdmin: true });
      const actor = makeActor(userRow);

      const p1 = await seedPipelineWithStages(db, ["Lead", "Demo"]);
      const s1 = p1.stages[0];
      if (s1 === undefined) throw new Error("setup: missing stage");
      await db.execute(sql`
        INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level, status)
        VALUES ('agg deal', ${p1.pipeline.id}, ${s1.id}, ${userRow.id}::uuid, 'all', 'open')
      `);

      const caller = createCaller({
        db,
        session: { userId: userRow.id, sessionId: "test-session-d2" },
        actor,
      });

      const out = await caller.stats.dashboard({
        pipelineId: null,
        ownerScope: { kind: "me" },
        from: "2026-01-01",
        to: "2026-12-31",
      });

      expect(out.funnel.length).toBeGreaterThan(0);
      expect(out.funnel[0]?.reached).toBeGreaterThanOrEqual(1);
    });
  });

  it("(f) offers every active user and team to an actor who can view others", async () => {
    await withTestDb(async (db) => {
      const userRow = await seedUser(db, { isAdmin: false });
      const mate = await seedUser(db, { isAdmin: false });
      const teamRow = (
        await db.execute(sql`INSERT INTO teams (name) VALUES ('West Coast') RETURNING id`)
      ).rows[0] as { id: string } | undefined;
      if (!teamRow) throw new Error("team insert failed");

      const caller = createCaller({
        db,
        session: { userId: userRow.id, sessionId: "test-session" },
        actor: makeActor(userRow, ["stats.viewOthers"]),
      });

      const out = await caller.stats.ownerOptions();
      expect(out.users.map((u) => u.id).sort()).toEqual([userRow.id, mate.id].sort());
      expect(out.teams).toEqual([{ id: teamRow.id, name: "West Coast" }]);
    });
  });

  it("(g) offers nobody to an actor who cannot view others", async () => {
    await withTestDb(async (db) => {
      const userRow = await seedUser(db, { isAdmin: false });
      await db.execute(sql`INSERT INTO teams (name) VALUES ('West Coast')`);

      const caller = createCaller({
        db,
        session: { userId: userRow.id, sessionId: "test-session" },
        actor: makeActor(userRow),
      });

      const out = await caller.stats.ownerOptions();
      expect(out.users).toEqual([]);
      expect(out.teams).toEqual([]);
    });
  });
});
