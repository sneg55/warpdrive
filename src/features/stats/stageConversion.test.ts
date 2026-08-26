// Fixtures move deals through moveDeal, never by inserting change_logs directly: the whole
// point of this query is that it reads the history the app actually writes.
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { deals } from "@/db/schema/deals";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createDeal, moveDeal } from "@/features/deals/dealActions";
import { adminSession, createSession, seedSettings } from "@/features/deals/dealMove.test-helpers";
import type { DashboardFilters } from "@/types/stats";
import { stageConversion } from "./stageConversion";

const BASE: DashboardFilters = {
  pipelineId: null,
  ownerScope: "all",
  from: "2000-01-01",
  to: "2100-12-31",
};

type Db = Parameters<Parameters<typeof withTestDb>[0]>[0];

async function makeDeal(
  db: Db,
  userId: string,
  pipelineId: string,
  stageId: string,
  title: string,
) {
  const created = await createDeal(
    db,
    createSession(userId),
    { title, pipelineId, stageId },
    new AbortController().signal,
  );
  if (created.ok === false) throw new Error(`createDeal failed: ${created.error.message}`);
  return created.value;
}

async function move(
  db: Db,
  userId: string,
  deal: { id: string; updatedAt: Date },
  toStageId: string,
) {
  const r = await moveDeal(
    db,
    adminSession(userId),
    {
      dealId: deal.id,
      toStageId,
      beforePosition: null,
      afterPosition: null,
      expectedUpdatedAt: deal.updatedAt.toISOString(),
    },
    new AbortController().signal,
  );
  if (r.ok === false) throw new Error(`moveDeal failed: ${r.error.message}`);
  return r.value;
}

describe("stageConversion", () => {
  it("counts a deal as having reached every stage up to the furthest it got", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A", "B", "C"]);
      const [s0, s1, s2] = p.stages;
      if (s0 === undefined || s1 === undefined || s2 === undefined) throw new Error("stages");

      const a = await makeDeal(db, u.id, p.pipeline.id, s0.id, "reaches C");
      const a1 = await move(db, u.id, a, s1.id);
      await move(db, u.id, a1, s2.id);

      const b = await makeDeal(db, u.id, p.pipeline.id, s0.id, "reaches B");
      await move(db, u.id, b, s1.id);

      await makeDeal(db, u.id, p.pipeline.id, s0.id, "stays at A");

      const rows = await stageConversion(
        db,
        adminSession(u.id),
        { ...BASE, pipelineId: p.pipeline.id },
        new AbortController().signal,
      );

      expect(rows.map((r) => r.reached)).toEqual([3, 2, 1]);
      expect(rows.map((r) => Math.round(r.conversion * 100))).toEqual([100, 67, 33]);
    });
  });

  it("keeps a deal that moved backwards credited with the furthest stage it reached", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A", "B", "C"]);
      const [s0, s1, s2] = p.stages;
      if (s0 === undefined || s1 === undefined || s2 === undefined) throw new Error("stages");

      const d = await makeDeal(db, u.id, p.pipeline.id, s0.id, "there and back");
      const d1 = await move(db, u.id, d, s2.id);
      await move(db, u.id, d1, s0.id);

      const rows = await stageConversion(
        db,
        adminSession(u.id),
        { ...BASE, pipelineId: p.pipeline.id },
        new AbortController().signal,
      );
      // It currently sits in A, but it did reach C, and a funnel measures how far deals got.
      expect(rows.map((r) => r.reached)).toEqual([1, 1, 1]);
    });
  });

  it("counts closed deals, not just the ones still open", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A", "B"]);
      const [s0, s1] = p.stages;
      if (s0 === undefined || s1 === undefined) throw new Error("stages");

      const d = await makeDeal(db, u.id, p.pipeline.id, s0.id, "won one");
      await move(db, u.id, d, s1.id);
      // Close it the way the app does, so the last interval has an end.
      await db.update(deals).set({ status: "won", wonTime: new Date() }).where(eq(deals.id, d.id));

      const rows = await stageConversion(
        db,
        adminSession(u.id),
        { ...BASE, pipelineId: p.pipeline.id },
        new AbortController().signal,
      );
      expect(rows.map((r) => r.reached)).toEqual([1, 1]);
    });
  });

  it("reports how long deals sit in a stage", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A", "B"]);
      const [s0, s1] = p.stages;
      if (s0 === undefined || s1 === undefined) throw new Error("stages");

      const d = await makeDeal(db, u.id, p.pipeline.id, s0.id, "measured");
      await move(db, u.id, d, s1.id);

      const rows = await stageConversion(
        db,
        adminSession(u.id),
        { ...BASE, pipelineId: p.pipeline.id },
        new AbortController().signal,
      );
      // Wall-clock durations are not assertable to a value here; what matters is that both
      // stages produce a real number rather than null.
      for (const r of rows) {
        expect(typeof r.medianDaysInStage).toBe("number");
        expect(r.medianDaysInStage ?? -1).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // The funnel reading "Qualified 10 · 100%" over four zeros is the arithmetic working, not
  // failing: reached is "got at least this far", and the cohort is narrower than the board.
  // These three cases pin the two narrowings the board does not have.
  it("credits a deal created straight into a later stage with every stage before it", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A", "B", "C", "D"]);
      const [, , , s3] = p.stages;
      if (s3 === undefined) throw new Error("stages");

      // No moves at all: max_order comes from the stage it is resting in.
      await makeDeal(db, u.id, p.pipeline.id, s3.id, "born in D");

      const rows = await stageConversion(
        db,
        adminSession(u.id),
        { ...BASE, pipelineId: p.pipeline.id },
        new AbortController().signal,
      );
      expect(rows.map((r) => r.reached)).toEqual([1, 1, 1, 1]);
    });
  });

  it("excludes a deal created before the range while counting one created inside it", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A", "B"]);
      const [s0] = p.stages;
      if (s0 === undefined) throw new Error("stages");

      const old = await makeDeal(db, u.id, p.pipeline.id, s0.id, "created years ago");
      await db
        .update(deals)
        .set({ createdAt: new Date("2020-05-05T12:00:00Z") })
        .where(eq(deals.id, old.id));
      await makeDeal(db, u.id, p.pipeline.id, s0.id, "created now");

      const thisYear = `${new Date().getUTCFullYear()}`;
      const rows = await stageConversion(
        db,
        adminSession(u.id),
        {
          ...BASE,
          from: `${thisYear}-01-01`,
          to: `${thisYear}-12-31`,
          pipelineId: p.pipeline.id,
        },
        new AbortController().signal,
      );
      // The board would show both cards; the funnel measures a cohort, so it counts one.
      expect(rows[0]?.reached).toBe(1);
    });
  });

  it("counts only the actor's own deals under ownerScope 'me'", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const mine = await seedUser(db);
      const theirs = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A", "B"]);
      const [s0] = p.stages;
      if (s0 === undefined) throw new Error("stages");

      await makeDeal(db, mine.id, p.pipeline.id, s0.id, "mine");
      await makeDeal(db, theirs.id, p.pipeline.id, s0.id, "theirs");

      const scoped = await stageConversion(
        db,
        adminSession(mine.id),
        { ...BASE, ownerScope: "me", pipelineId: p.pipeline.id },
        new AbortController().signal,
      );
      const everyone = await stageConversion(
        db,
        adminSession(mine.id),
        { ...BASE, pipelineId: p.pipeline.id },
        new AbortController().signal,
      );
      expect(scoped[0]?.reached).toBe(1);
      expect(everyone[0]?.reached).toBe(2);
    });
  });

  it("windows on deal creation, so the range picks which cohort is measured", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A", "B"]);
      const [s0] = p.stages;
      if (s0 === undefined) throw new Error("stages");
      await makeDeal(db, u.id, p.pipeline.id, s0.id, "today's deal");

      const rows = await stageConversion(
        db,
        adminSession(u.id),
        { ...BASE, from: "1999-01-01", to: "1999-12-31", pipelineId: p.pipeline.id },
        new AbortController().signal,
      );
      expect(rows.map((r) => r.reached)).toEqual([0, 0]);
    });
  });
});
