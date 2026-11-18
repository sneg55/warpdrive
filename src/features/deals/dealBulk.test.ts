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

      const [d] = await db.select().from(deals).where(eq(deals.id, created.value.id));
      expect(d?.stageId).toBe(stageA.id);
    });
  });

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

      const r = await bulkUpdateStage(
        db,
        noBulk(u.id),
        { dealIds: [created.value.id], toStageId: stageB.id },
        new AbortController().signal,
      );
      expect(r.ok).toBe(false);
    });
  });

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

      const r = await bulkUpdateStage(
        db,
        bulkEditorAny(attacker.id),
        { dealIds: [created.value.id], toStageId: stageB.id },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      expect(r.value[0]?.outcome).toBe("not_found");
    });
  });

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

      const r = await bulkUpdateStage(
        db,
        bulkEditorNoEdit(nonEditor.id),
        { dealIds: [created.value.id], toStageId: stageB.id },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      expect(r.value[0]?.outcome).toBe("skipped");
      const [after] = await db.select().from(deals).where(eq(deals.id, created.value.id));
      expect(after?.stageId).toBe(stageA.id);
    });
  });

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
      await db.update(deals).set({ status: "won" }).where(eq(deals.id, created.value.id));

      const r = await bulkUpdateStage(
        db,
        adminActor(u.id),
        { dealIds: [created.value.id], toStageId: stageB.id },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      expect(r.value[0]?.outcome).toBe("not_found");
      const [after] = await db.select().from(deals).where(eq(deals.id, created.value.id));
      expect(after?.stageId).toBe(stageA.id);
    });
  });

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

      const r = await bulkUpdateStage(
        db,
        adminActor(u.id),
        { dealIds: [created.value.id], toStageId: p2StageY.id },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      expect(r.value[0]?.outcome).toBe("pipeline_mismatch");
      const [after] = await db.select().from(deals).where(eq(deals.id, created.value.id));
      expect(after?.stageId).toBe(p1StageA.id);
      expect(after?.pipelineId).toBe(p1.pipeline.id);
    });
  });
});
