import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { deals } from "@/db/schema/deals";
import { pipelines } from "@/db/schema/pipelines";
import { withTestDb } from "@/db/testing";
import { updateDeal } from "./dealActions";
import { moveDeal } from "./dealMove";
import { adminSession } from "./dealMove.test-helpers";
import { setupDeal } from "./dealUpdate.test-helpers";

describe("loadEditableDeal hides deleted / archived-pipeline deals", () => {
  it("updateDeal returns 404 for a deal in an archived pipeline", async () => {
    await withTestDb(async (db) => {
      const { u, deal, p } = await setupDeal(db);
      await db.update(pipelines).set({ isArchived: true }).where(eq(pipelines.id, p.pipeline.id));

      const r = await updateDeal(
        db,
        adminSession(u.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt.toISOString(),
          title: "should not apply",
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.id).toBe("E_DEAL_001");
    });
  });

  it("updateDeal returns 404 for a soft-deleted deal", async () => {
    await withTestDb(async (db) => {
      const { u, deal } = await setupDeal(db);
      await db.update(deals).set({ deletedAt: new Date() }).where(eq(deals.id, deal.id));

      const r = await updateDeal(
        db,
        adminSession(u.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt.toISOString(),
          title: "should not apply",
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.id).toBe("E_DEAL_001");
    });
  });

  it("moveDeal returns 404 for a deal in an archived pipeline", async () => {
    await withTestDb(async (db) => {
      const { u, deal, p } = await setupDeal(db);
      await db.update(pipelines).set({ isArchived: true }).where(eq(pipelines.id, p.pipeline.id));

      const r = await moveDeal(
        db,
        adminSession(u.id),
        {
          dealId: deal.id,
          toStageId: p.stages[0]!.id,
          expectedUpdatedAt: deal.updatedAt.toISOString(),
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.id).toBe("E_DEAL_001");
    });
  });
});
