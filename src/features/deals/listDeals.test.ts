import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createDeal } from "./dealActions";
import { admin, ownerOnly, seedAllVisible, seedOwnerOnly } from "./dealList.test-helpers";
import { listDeals } from "./dealRepo";

describe("listDeals", () => {
  it("paginates and totals the filtered set value", async () => {
    await withTestDb(async (db) => {
      await seedAllVisible(db);
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A"]);
      const stage = p.stages[0];
      if (!stage) throw new Error("setup: no stage");
      await createDeal(
        db,
        admin(u.id),
        { title: "a", pipelineId: p.pipeline.id, stageId: stage.id, value: 100 },
        new AbortController().signal,
      );
      await createDeal(
        db,
        admin(u.id),
        { title: "b", pipelineId: p.pipeline.id, stageId: stage.id, value: 200 },
        new AbortController().signal,
      );
      const out = await listDeals(
        db,
        admin(u.id),
        { pipelineId: p.pipeline.id, offset: 0, limit: 50 },
        new AbortController().signal,
      );
      expect(out.total).toBe(2);
      expect(Number(out.totalValue)).toBe(300);
    });
  });

  // SECURITY: a hidden deal must be excluded from BOTH rows AND totals.
  it("excludes a hidden deal from rows and from the total value", async () => {
    await withTestDb(async (db) => {
      await seedOwnerOnly(db);
      const owner = await seedUser(db);
      const viewer = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A"]);
      const stage = p.stages[0];
      if (!stage) throw new Error("setup: no stage");

      // Owner's deal: 500, not visible to viewer
      await createDeal(
        db,
        ownerOnly(owner.id),
        { title: "hidden", pipelineId: p.pipeline.id, stageId: stage.id, value: 500 },
        new AbortController().signal,
      );
      // Viewer's own deal: 100, visible to viewer
      await createDeal(
        db,
        ownerOnly(viewer.id),
        { title: "visible", pipelineId: p.pipeline.id, stageId: stage.id, value: 100 },
        new AbortController().signal,
      );

      const out = await listDeals(
        db,
        ownerOnly(viewer.id),
        { pipelineId: p.pipeline.id, offset: 0, limit: 50 },
        new AbortController().signal,
      );
      // Only the visible deal counts
      expect(out.total).toBe(1);
      expect(Number(out.totalValue)).toBe(100);
      expect(out.rows.find((r) => r.title === "hidden")).toBeUndefined();
    });
  });
});
