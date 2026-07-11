// dealMove.test.ts: CAS precondition + pipeline-stage validation tests.
// Permission + event tests live in dealMovePerms.test.ts.
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { changeLogs } from "@/db/schema";
import { deals } from "@/db/schema/deals";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createDeal, moveDeal } from "./dealActions";
import { adminSession, createSession, seedSettings } from "./dealMove.test-helpers";

describe("moveDeal: CAS + stage validation", () => {
  it("moves a deal to another stage and updates stageId + stageEnteredAt", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A", "B"]);
      const stage0 = p.stages[0];
      const stage1 = p.stages[1];
      if (stage0 === undefined || stage1 === undefined) throw new Error("setup: missing stages");

      const created = await createDeal(
        db,
        createSession(u.id),
        { title: "Test deal", pipelineId: p.pipeline.id, stageId: stage0.id },
        new AbortController().signal,
      );
      if (created.ok === false) throw new Error(`createDeal failed: ${created.error.message}`);

      const before = created.value.stageEnteredAt;
      await new Promise((r) => setTimeout(r, 10));

      const r = await moveDeal(
        db,
        adminSession(u.id),
        {
          dealId: created.value.id,
          toStageId: stage1.id,
          beforePosition: null,
          afterPosition: null,
          expectedUpdatedAt: created.value.updatedAt.toISOString(),
        },
        new AbortController().signal,
      );

      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      expect(r.value.stageId).toBe(stage1.id);
      expect(r.value.stageEnteredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());

      // The move must write a stageId audit-log row (deal-header history parity).
      const logs = await db
        .select()
        .from(changeLogs)
        .where(and(eq(changeLogs.entityId, created.value.id), eq(changeLogs.field, "stageId")));
      expect(logs.length).toBe(1);
      expect(logs[0]?.oldValue).toBe(stage0.id);
      expect(logs[0]?.newValue).toBe(stage1.id);
    });
  });

  it("does NOT write a stageId log for an intra-column reorder (same stage)", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A", "B"]);
      const stage0 = p.stages[0];
      if (stage0 === undefined) throw new Error("setup: missing stage");
      const created = await createDeal(
        db,
        createSession(u.id),
        { title: "Reorder", pipelineId: p.pipeline.id, stageId: stage0.id },
        new AbortController().signal,
      );
      if (created.ok === false) throw new Error("createDeal failed");

      const r = await moveDeal(
        db,
        adminSession(u.id),
        {
          dealId: created.value.id,
          toStageId: stage0.id, // same stage: a reorder, not a transition
          beforePosition: null,
          afterPosition: null,
          expectedUpdatedAt: created.value.updatedAt.toISOString(),
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      const logs = await db
        .select()
        .from(changeLogs)
        .where(and(eq(changeLogs.entityId, created.value.id), eq(changeLogs.field, "stageId")));
      expect(logs.length).toBe(0);
    });
  });

  it("places board_position between null neighbors (computed via midpoint)", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A", "B"]);
      const stage0 = p.stages[0];
      const stage1 = p.stages[1];
      if (stage0 === undefined || stage1 === undefined) throw new Error("setup: missing stages");

      const created = await createDeal(
        db,
        createSession(u.id),
        { title: "Pos deal", pipelineId: p.pipeline.id, stageId: stage0.id },
        new AbortController().signal,
      );
      if (created.ok === false) throw new Error(`createDeal failed: ${created.error.message}`);

      const r = await moveDeal(
        db,
        adminSession(u.id),
        {
          dealId: created.value.id,
          toStageId: stage1.id,
          beforePosition: "1",
          afterPosition: "2",
          expectedUpdatedAt: created.value.updatedAt.toISOString(),
        },
        new AbortController().signal,
      );

      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      const pos = Number(r.value.boardPosition);
      expect(pos).toBeGreaterThan(1);
      expect(pos).toBeLessThan(2);
    });
  });

  it("returns E_DEAL_002 when expectedUpdatedAt is stale and leaves deal unchanged", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A", "B"]);
      const stage0 = p.stages[0];
      const stage1 = p.stages[1];
      if (stage0 === undefined || stage1 === undefined) throw new Error("setup: missing stages");

      const created = await createDeal(
        db,
        createSession(u.id),
        { title: "CAS deal", pipelineId: p.pipeline.id, stageId: stage0.id },
        new AbortController().signal,
      );
      if (created.ok === false) throw new Error(`createDeal failed: ${created.error.message}`);

      const r = await moveDeal(
        db,
        adminSession(u.id),
        {
          dealId: created.value.id,
          toStageId: stage1.id,
          beforePosition: null,
          afterPosition: null,
          expectedUpdatedAt: "2000-01-01T00:00:00.000Z", // stale
        },
        new AbortController().signal,
      );

      expect(r.ok).toBe(false);
      if (r.ok === true) return;
      expect(r.error.id).toBe("E_DEAL_002");

      // Confirm the deal was NOT modified (CAS atomicity: single UPDATE WHERE)
      const rows = await db.select().from(deals).where(eq(deals.id, created.value.id));
      const row = rows[0];
      expect(row?.stageId).toBe(stage0.id);
    });
  });

  it("returns E_DEAL_003 when toStageId belongs to a different pipeline", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const u = await seedUser(db);
      const pA = await seedPipelineWithStages(db, ["A1"]);
      const pB = await seedPipelineWithStages(db, ["B1"]);
      const stageA = pA.stages[0];
      const stageB = pB.stages[0];
      if (stageA === undefined || stageB === undefined) throw new Error("setup: missing stages");

      const created = await createDeal(
        db,
        createSession(u.id),
        { title: "Pipeline mismatch", pipelineId: pA.pipeline.id, stageId: stageA.id },
        new AbortController().signal,
      );
      if (created.ok === false) throw new Error(`createDeal failed: ${created.error.message}`);

      const r = await moveDeal(
        db,
        adminSession(u.id),
        {
          dealId: created.value.id,
          toStageId: stageB.id, // belongs to pipeline B, not A
          beforePosition: null,
          afterPosition: null,
          expectedUpdatedAt: created.value.updatedAt.toISOString(),
        },
        new AbortController().signal,
      );

      expect(r.ok).toBe(false);
      if (r.ok === true) return;
      expect(r.error.id).toBe("E_DEAL_003");
    });
  });
});
