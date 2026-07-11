import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { deals } from "@/db/schema/deals";
import { pipelines } from "@/db/schema/pipelines";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { bulkUpdateStage } from "./bulkActions";
import { createDeal } from "./dealActions";
import {
  admin,
  adminActor,
  bulkEditorAny,
  bulkEditorNoEdit,
  noBulk,
  ownerOnly,
  seedAllVisible,
  seedOwnerOnly,
} from "./dealList.test-helpers";

describe("bulkUpdateStage", () => {
  it("applied for visible+editable, not_found for unknown ids", async () => {
    await withTestDb(async (db) => {
      await seedAllVisible(db);
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A", "B"]);
      const stageA = p.stages[0];
      const stageB = p.stages[1];
      if (!stageA || !stageB) throw new Error("setup: missing stages");

      const created = await createDeal(
        db,
        admin(u.id),
        { title: "moveable", pipelineId: p.pipeline.id, stageId: stageA.id },
        new AbortController().signal,
      );
      if (!created.ok) throw new Error(`createDeal failed: ${created.error.message}`);

      const r = await bulkUpdateStage(
        db,
        adminActor(u.id),
        {
          dealIds: [created.value.id, "99999999-9999-9999-9999-999999999999"],
          toStageId: stageB.id,
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      const byId = Object.fromEntries(r.value.map((x) => [x.dealId, x.outcome]));
      expect(byId[created.value.id]).toBe("applied");
      expect(byId["99999999-9999-9999-9999-999999999999"]).toBe("not_found");
    });
  });

  // Codex finding F21: Stage-1 loads candidates through dealVisibilityClause, which gates
  // the restricted-pipeline group but NOT is_archived. A bulk.edit actor with stale ids
  // could move open deals inside an archived pipeline even though individual move/update now
  // 404 them. An archived-pipeline deal must be not_found and stay put.
  it("not_found for a deal in an archived pipeline (never moved)", async () => {
    await withTestDb(async (db) => {
      await seedAllVisible(db);
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A", "B"]);
      const stageA = p.stages[0];
      const stageB = p.stages[1];
      if (!stageA || !stageB) throw new Error("setup: missing stages");

      const created = await createDeal(
        db,
        admin(u.id),
        { title: "d", pipelineId: p.pipeline.id, stageId: stageA.id },
        new AbortController().signal,
      );
      if (!created.ok) throw new Error(`createDeal failed: ${created.error.message}`);

      // Archive the pipeline AFTER the deal exists (stale-id scenario).
      await db.update(pipelines).set({ isArchived: true }).where(eq(pipelines.id, p.pipeline.id));

      const r = await bulkUpdateStage(
        db,
        adminActor(u.id),
        { dealIds: [created.value.id], toStageId: stageB.id },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      const byId = Object.fromEntries(r.value.map((x) => [x.dealId, x.outcome]));
      expect(byId[created.value.id]).toBe("not_found");

      // The deal must NOT have been moved.
      const [d] = await db.select().from(deals).where(eq(deals.id, created.value.id));
      expect(d?.stageId).toBe(stageA.id);
    });
  });

  // SECURITY: bulk.edit gate denies the WHOLE op before touching any row
  it("denied entirely when session lacks bulk.edit", async () => {
    await withTestDb(async (db) => {
      await seedAllVisible(db);
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A", "B"]);
      const stageA = p.stages[0];
      const stageB = p.stages[1];
      if (!stageA || !stageB) throw new Error("setup: missing stages");

      const created = await createDeal(
        db,
        admin(u.id),
        { title: "deal", pipelineId: p.pipeline.id, stageId: stageA.id },
        new AbortController().signal,
      );
      if (!created.ok) throw new Error(`createDeal failed: ${created.error.message}`);

      // noBulk has deal.edit_any but no bulk.edit flag
      const r = await bulkUpdateStage(
        db,
        noBulk(u.id),
        { dealIds: [created.value.id], toStageId: stageB.id },
        new AbortController().signal,
      );
      expect(r.ok).toBe(false);
    });
  });

  // SECURITY (6.5 two-stage): invisible deal must collapse to not_found, not skipped
  it("invisible deal returns not_found (not skipped)", async () => {
    await withTestDb(async (db) => {
      await seedOwnerOnly(db);
      const owner = await seedUser(db);
      const attacker = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A", "B"]);
      const stageA = p.stages[0];
      const stageB = p.stages[1];
      if (!stageA || !stageB) throw new Error("setup: missing stages");

      const created = await createDeal(
        db,
        ownerOnly(owner.id),
        { title: "secret", pipelineId: p.pipeline.id, stageId: stageA.id },
        new AbortController().signal,
      );
      if (!created.ok) throw new Error(`createDeal failed: ${created.error.message}`);

      // Attacker has bulk.edit + deal.edit_any but cannot SEE the deal
      const r = await bulkUpdateStage(
        db,
        bulkEditorAny(attacker.id),
        { dealIds: [created.value.id], toStageId: stageB.id },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      // Must be not_found, NOT skipped (no existence disclosure)
      expect(r.value[0]?.outcome).toBe("not_found");
    });
  });

  // SECURITY: visible-but-not-editable deal returns skipped (never mutated)
  it("visible-but-not-editable deal returns skipped", async () => {
    await withTestDb(async (db) => {
      await seedAllVisible(db);
      const owner = await seedUser(db);
      const nonEditor = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A", "B"]);
      const stageA = p.stages[0];
      const stageB = p.stages[1];
      if (!stageA || !stageB) throw new Error("setup: missing stages");

      const created = await createDeal(
        db,
        admin(owner.id),
        { title: "visible-deal", pipelineId: p.pipeline.id, stageId: stageA.id },
        new AbortController().signal,
      );
      if (!created.ok) throw new Error(`createDeal failed: ${created.error.message}`);

      // nonEditor has bulk.edit but no deal.edit_* flag (cannot edit others' deals)
      const r = await bulkUpdateStage(
        db,
        bulkEditorNoEdit(nonEditor.id),
        { dealIds: [created.value.id], toStageId: stageB.id },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      // Visible but not editable -> skipped, not mutated
      expect(r.value[0]?.outcome).toBe("skipped");
      const [after] = await db.select().from(deals).where(eq(deals.id, created.value.id));
      expect(after?.stageId).toBe(stageA.id);
    });
  });

  // SECURITY (data integrity): a closed (won) deal is out of bulk scope.
  it("a won deal is NOT moved (not_found)", async () => {
    await withTestDb(async (db) => {
      await seedAllVisible(db);
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A", "B"]);
      const stageA = p.stages[0];
      const stageB = p.stages[1];
      if (!stageA || !stageB) throw new Error("setup: missing stages");

      const created = await createDeal(
        db,
        admin(u.id),
        { title: "won-deal", pipelineId: p.pipeline.id, stageId: stageA.id },
        new AbortController().signal,
      );
      if (!created.ok) throw new Error(`createDeal failed: ${created.error.message}`);
      // Mark it won (closed): stage-1 must exclude it via status='open'.
      await db.update(deals).set({ status: "won" }).where(eq(deals.id, created.value.id));

      const r = await bulkUpdateStage(
        db,
        adminActor(u.id),
        { dealIds: [created.value.id], toStageId: stageB.id },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      // Closed deal collapses to not_found (out of bulk scope, same as invisible).
      expect(r.value[0]?.outcome).toBe("not_found");
      const [after] = await db.select().from(deals).where(eq(deals.id, created.value.id));
      expect(after?.stageId).toBe(stageA.id);
    });
  });

  // SECURITY (data integrity): a toStageId from a DIFFERENT pipeline is rejected.
  it("cross-pipeline toStageId is rejected (pipeline_mismatch, not applied)", async () => {
    await withTestDb(async (db) => {
      await seedAllVisible(db);
      const u = await seedUser(db);
      const p1 = await seedPipelineWithStages(db, ["A", "B"]);
      const p2 = await seedPipelineWithStages(db, ["X", "Y"]);
      const p1StageA = p1.stages[0];
      const p2StageY = p2.stages[1];
      if (!p1StageA || !p2StageY) throw new Error("setup: missing stages");

      const created = await createDeal(
        db,
        admin(u.id),
        { title: "p1-deal", pipelineId: p1.pipeline.id, stageId: p1StageA.id },
        new AbortController().signal,
      );
      if (!created.ok) throw new Error(`createDeal failed: ${created.error.message}`);

      // Try to move p1's deal into a stage that belongs to p2.
      const r = await bulkUpdateStage(
        db,
        adminActor(u.id),
        { dealIds: [created.value.id], toStageId: p2StageY.id },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      // Must be rejected, never applied.
      expect(r.value[0]?.outcome).toBe("pipeline_mismatch");
      const [after] = await db.select().from(deals).where(eq(deals.id, created.value.id));
      expect(after?.stageId).toBe(p1StageA.id);
      expect(after?.pipelineId).toBe(p1.pipeline.id);
    });
  });
});
