// Integration test: real Postgres, real migrations. The trend is the only stats query that is
// not a resting-state snapshot, so what it must prove is bucketing, gap filling and scoping.
import { describe, expect, it } from "vitest";
import { deals } from "@/db/schema/deals";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { adminSession, regularSession, seedSettings } from "@/features/deals/dealMove.test-helpers";
import type { DashboardFilters } from "@/types/stats";
import { wonTrend } from "./wonTrend";

type Db = Parameters<Parameters<typeof withTestDb>[0]>[0];

const BASE: DashboardFilters = {
  pipelineId: null,
  ownerScope: "all",
  from: "2026-01-01",
  to: "2026-04-30",
};

async function seedWon(
  db: Db,
  args: {
    pipelineId: string;
    stageId: string;
    ownerId: string;
    wonTime: string | null;
    value: string;
    visibilityLevel?: "all" | "owner";
    status?: "won" | "lost" | "open";
  },
) {
  await db.insert(deals).values({
    title: "Deal",
    pipelineId: args.pipelineId,
    stageId: args.stageId,
    ownerId: args.ownerId,
    visibilityLevel: args.visibilityLevel ?? "all",
    status: args.status ?? "won",
    value: args.value,
    wonTime: args.wonTime === null ? null : new Date(args.wonTime),
  });
}

async function fixture(db: Db) {
  await seedSettings(db);
  const user = await seedUser(db);
  const p = await seedPipelineWithStages(db, ["A"]);
  const stage = p.stages[0];
  if (stage === undefined) throw new Error("no stage");
  return { user, pipelineId: p.pipeline.id, stageId: stage.id };
}

describe("wonTrend", () => {
  it("buckets won deals by the month they were won", async () => {
    await withTestDb(async (db) => {
      const f = await fixture(db);
      const common = { pipelineId: f.pipelineId, stageId: f.stageId, ownerId: f.user.id };
      await seedWon(db, { ...common, wonTime: "2026-01-10T12:00:00Z", value: "1000.00" });
      await seedWon(db, { ...common, wonTime: "2026-01-20T12:00:00Z", value: "500.00" });
      await seedWon(db, { ...common, wonTime: "2026-03-05T12:00:00Z", value: "2000.00" });

      const points = await wonTrend(
        db,
        adminSession(f.user.id),
        BASE,
        new AbortController().signal,
      );

      expect(points.map((p) => p.month)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
      expect(points.map((p) => p.count)).toEqual([2, 0, 1, 0]);
      expect(points.map((p) => p.value)).toEqual(["1500.00", "0.00", "2000.00", "0.00"]);
    });
  });

  // A gap in a line reads as missing data. A month nobody won anything in is a fact, not a hole.
  it("emits a zero bucket for every month in the range, including months with no wins", async () => {
    await withTestDb(async (db) => {
      const f = await fixture(db);

      const points = await wonTrend(
        db,
        adminSession(f.user.id),
        BASE,
        new AbortController().signal,
      );

      expect(points).toHaveLength(4);
      expect(points.every((p) => p.count === 0 && p.value === "0.00")).toBe(true);
    });
  });

  it("counts only deals won inside the range", async () => {
    await withTestDb(async (db) => {
      const f = await fixture(db);
      const common = { pipelineId: f.pipelineId, stageId: f.stageId, ownerId: f.user.id };
      await seedWon(db, { ...common, wonTime: "2025-12-31T12:00:00Z", value: "9000.00" });
      await seedWon(db, { ...common, wonTime: "2026-02-02T12:00:00Z", value: "7.00" });

      const points = await wonTrend(
        db,
        adminSession(f.user.id),
        BASE,
        new AbortController().signal,
      );

      expect(points.map((p) => p.count)).toEqual([0, 1, 0, 0]);
    });
  });

  it("ignores open and lost deals", async () => {
    await withTestDb(async (db) => {
      const f = await fixture(db);
      const common = { pipelineId: f.pipelineId, stageId: f.stageId, ownerId: f.user.id };
      await seedWon(db, { ...common, wonTime: null, value: "100.00", status: "open" });
      await seedWon(db, {
        ...common,
        wonTime: "2026-01-05T12:00:00Z",
        value: "100.00",
        status: "lost",
      });

      const points = await wonTrend(
        db,
        adminSession(f.user.id),
        BASE,
        new AbortController().signal,
      );

      expect(points.map((p) => p.count)).toEqual([0, 0, 0, 0]);
    });
  });

  it("honours ownerScope 'me' by dropping another owner's wins", async () => {
    await withTestDb(async (db) => {
      const f = await fixture(db);
      const other = await seedUser(db);
      const common = { pipelineId: f.pipelineId, stageId: f.stageId };
      await seedWon(db, {
        ...common,
        ownerId: f.user.id,
        wonTime: "2026-01-05T12:00:00Z",
        value: "10.00",
      });
      await seedWon(db, {
        ...common,
        ownerId: other.id,
        wonTime: "2026-01-06T12:00:00Z",
        value: "90.00",
      });

      const mine = await wonTrend(
        db,
        adminSession(f.user.id),
        { ...BASE, ownerScope: "me" },
        new AbortController().signal,
      );
      expect(mine[0]?.count).toBe(1);
      expect(mine[0]?.value).toBe("10.00");

      const all = await wonTrend(db, adminSession(f.user.id), BASE, new AbortController().signal);
      expect(all[0]?.count).toBe(2);
      expect(all[0]?.value).toBe("100.00");
    });
  });

  // A stats query that leaks a restricted deal is a security bug, not a rounding error.
  it("applies the deal visibility predicate, so an owner-only deal stays out of another user's trend", async () => {
    await withTestDb(async (db) => {
      const f = await fixture(db);
      const other = await seedUser(db);
      await seedWon(db, {
        pipelineId: f.pipelineId,
        stageId: f.stageId,
        ownerId: other.id,
        wonTime: "2026-01-05T12:00:00Z",
        value: "50000.00",
        visibilityLevel: "owner",
      });

      const points = await wonTrend(
        db,
        regularSession(f.user.id),
        BASE,
        new AbortController().signal,
      );
      expect(points.map((p) => p.count)).toEqual([0, 0, 0, 0]);
      expect(points.map((p) => p.value)).toEqual(["0.00", "0.00", "0.00", "0.00"]);
    });
  });

  it("scopes to one pipeline when a pipeline is selected", async () => {
    await withTestDb(async (db) => {
      const f = await fixture(db);
      const otherPipeline = await seedPipelineWithStages(db, ["A"]);
      const otherStage = otherPipeline.stages[0];
      if (otherStage === undefined) throw new Error("no stage");
      await seedWon(db, {
        pipelineId: f.pipelineId,
        stageId: f.stageId,
        ownerId: f.user.id,
        wonTime: "2026-01-05T12:00:00Z",
        value: "10.00",
      });
      await seedWon(db, {
        pipelineId: otherPipeline.pipeline.id,
        stageId: otherStage.id,
        ownerId: f.user.id,
        wonTime: "2026-01-05T12:00:00Z",
        value: "90.00",
      });

      const points = await wonTrend(
        db,
        adminSession(f.user.id),
        { ...BASE, pipelineId: f.pipelineId },
        new AbortController().signal,
      );
      expect(points[0]?.count).toBe(1);
      expect(points[0]?.value).toBe("10.00");
    });
  });

  it("returns no points at all when the range runs backwards", async () => {
    await withTestDb(async (db) => {
      const f = await fixture(db);
      const points = await wonTrend(
        db,
        adminSession(f.user.id),
        { ...BASE, from: "2026-06-01", to: "2026-01-01" },
        new AbortController().signal,
      );
      expect(points).toEqual([]);
    });
  });

  it("throws when the signal is already aborted", async () => {
    await withTestDb(async (db) => {
      const f = await fixture(db);
      const controller = new AbortController();
      controller.abort();
      await expect(
        wonTrend(db, adminSession(f.user.id), BASE, controller.signal),
      ).rejects.toThrow();
    });
  });
});
