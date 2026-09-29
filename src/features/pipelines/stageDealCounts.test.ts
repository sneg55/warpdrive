import { describe, expect, it } from "vitest";
import { deals } from "@/db/schema/deals";
import { visibilityGroups } from "@/db/schema/identity";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { countDealsByStageForSession } from "./pipelineRouter";
import { countDealsByStage } from "./stageDealCounts";

const sig = () => new AbortController().signal;

describe("countDealsByStage", () => {
  it("counts every deal per stage, including closed and soft-deleted ones, and how many are closed", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A", "B", "C"]);
      const [a, b, c] = p.stages;
      const base = {
        pipelineId: p.pipeline.id,
        ownerId: owner.id,
        visibilityLevel: "all" as const,
      };
      await db.insert(deals).values([
        { ...base, stageId: a!.id, title: "open" },
        { ...base, stageId: a!.id, title: "won", status: "won" },
        { ...base, stageId: a!.id, title: "lost", status: "lost" },
        { ...base, stageId: a!.id, title: "gone", deletedAt: new Date() },
        { ...base, stageId: b!.id, title: "b-open" },
      ]);

      const counts = await countDealsByStage(db, p.pipeline.id, sig());

      expect(counts).toEqual({
        [a!.id]: { total: 4, closed: 2 },
        [b!.id]: { total: 1, closed: 0 },
      });
      expect(counts[c!.id]).toBeUndefined();
    });
  });
});

describe("countDealsByStageForSession", () => {
  it("returns nothing for a pipeline the session cannot see, and counts for one it can", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const [group] = await db.insert(visibilityGroups).values({ name: "Restricted" }).returning();
      const restricted = await seedPipelineWithStages(db, ["A"], {
        visibilityGroupId: group!.id,
      });
      const open = await seedPipelineWithStages(db, ["B"]);
      const base = { ownerId: owner.id, visibilityLevel: "all" as const };
      await db.insert(deals).values([
        {
          ...base,
          pipelineId: restricted.pipeline.id,
          stageId: restricted.stages[0]!.id,
          title: "r",
        },
        { ...base, pipelineId: open.pipeline.id, stageId: open.stages[0]!.id, title: "o" },
      ]);
      const outsider = { isAdmin: false, visibilityGroupIds: [] as string[], canManage: true };

      expect(
        await countDealsByStageForSession(db, outsider, restricted.pipeline.id, sig()),
      ).toEqual({});
      expect(await countDealsByStageForSession(db, outsider, open.pipeline.id, sig())).toEqual({
        [open.stages[0]!.id]: { total: 1, closed: 0 },
      });
      const noManage = { ...outsider, canManage: false };
      expect(await countDealsByStageForSession(db, noManage, open.pipeline.id, sig())).toEqual({});
    });
  });
});
