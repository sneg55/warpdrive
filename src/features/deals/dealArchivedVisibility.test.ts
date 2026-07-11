import { describe, expect, it } from "vitest";
import { deals } from "@/db/schema/deals";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { ownerOnly } from "./dealList.test-helpers";
import { getStageSums, listDeals } from "./dealRepo";

// Codex finding F7: deal reads join pipelines only for the visibility-group predicate and
// never filter p.is_archived. listVisiblePipelines/stats treat archived pipelines as
// invisible, so open deals in an archived (public) pipeline must not leak through the deal
// list or stage sums either.

type Db = Parameters<Parameters<typeof withTestDb>[0]>[0];

async function seedOpenDeal(
  db: Db,
  pipelineId: string,
  stageId: string,
  ownerId: string,
  boardPosition: string,
): Promise<void> {
  await db.insert(deals).values({
    title: "d",
    status: "open",
    pipelineId,
    stageId,
    boardPosition,
    ownerId,
    visibilityLevel: "all", // visible to everyone; archived-pipeline gate is the only filter
  });
}

describe("archived pipeline deal visibility", () => {
  it("excludes deals in an archived pipeline from listDeals", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const archived = await seedPipelineWithStages(db, ["A"], { isArchived: true });
      const live = await seedPipelineWithStages(db, ["B"]);
      const aStage = archived.stages[0]!;
      const bStage = live.stages[0]!;
      await seedOpenDeal(db, archived.pipeline.id, aStage.id, u.id, "1000");
      await seedOpenDeal(db, live.pipeline.id, bStage.id, u.id, "1000");

      const out = await listDeals(
        db,
        ownerOnly(u.id),
        { offset: 0, limit: 50 },
        new AbortController().signal,
      );
      expect(out.total).toBe(1);
      expect(out.rows.every((r) => r.stageId !== aStage.id)).toBe(true);
    });
  });

  it("excludes deals in an archived pipeline from stageSums", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const archived = await seedPipelineWithStages(db, ["A"], { isArchived: true });
      const aStage = archived.stages[0]!;
      await seedOpenDeal(db, archived.pipeline.id, aStage.id, u.id, "1000");

      const sums = await getStageSums(
        db,
        ownerOnly(u.id),
        archived.pipeline.id,
        new AbortController().signal,
      );
      expect(sums.length).toBe(0);
    });
  });
});
