import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import type { DashboardFilters } from "@/types/stats";
import { seedDeal, seedPipeline, seedUser, toActor } from "./statsTestHelpers";
import { wonDealStats } from "./wonDealStats";

let h: TestDb;
beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});

const BASE: DashboardFilters = {
  pipelineId: null,
  ownerScope: "all",
  from: "2025-01-01",
  to: "2025-12-31",
};

describe("wonDealStats", () => {
  it("reports the average and median value of deals won in the range", async () => {
    const user = await seedUser(h, { isAdmin: true });
    const { pipeline, stages } = await seedPipeline(h);
    const stage = stages[0];
    if (stage === undefined) throw new Error("no stage");
    for (const value of ["100.00", "200.00", "900.00"]) {
      await seedDeal(h, {
        title: `won ${value}`,
        status: "won",
        value,
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: user.id,
        visibilityLevel: "all",
        createdAt: new Date("2025-01-01T00:00:00Z"),
        wonTime: new Date("2025-06-01T00:00:00Z"),
      });
    }

    const r = await wonDealStats(
      h.db,
      toActor(user),
      { ...BASE, pipelineId: pipeline.id },
      new AbortController().signal,
    );
    expect(Number(r.avgValue)).toBe(400);
    // Median resists the one large deal that drags the mean to 400.
    expect(Number(r.medianValue)).toBe(200);
  });

  it("reports the sales cycle in days from creation to win", async () => {
    const user = await seedUser(h, { isAdmin: true });
    const { pipeline, stages } = await seedPipeline(h);
    const stage = stages[0];
    if (stage === undefined) throw new Error("no stage");
    await seedDeal(h, {
      title: "ten day deal",
      status: "won",
      value: "10.00",
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: user.id,
      visibilityLevel: "all",
      createdAt: new Date("2025-06-01T00:00:00Z"),
      wonTime: new Date("2025-06-11T00:00:00Z"),
    });

    const r = await wonDealStats(
      h.db,
      toActor(user),
      { ...BASE, pipelineId: pipeline.id },
      new AbortController().signal,
    );
    expect(r.medianCycleDays).toBeCloseTo(10, 5);
  });

  it("windows on won time, not creation time", async () => {
    const user = await seedUser(h, { isAdmin: true });
    const { pipeline, stages } = await seedPipeline(h);
    const stage = stages[0];
    if (stage === undefined) throw new Error("no stage");
    await seedDeal(h, {
      title: "won after the range",
      status: "won",
      value: "5000.00",
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: user.id,
      visibilityLevel: "all",
      createdAt: new Date("2025-06-01T00:00:00Z"),
      wonTime: new Date("2026-06-01T00:00:00Z"),
    });

    const r = await wonDealStats(
      h.db,
      toActor(user),
      { ...BASE, pipelineId: pipeline.id },
      new AbortController().signal,
    );
    expect(r.avgValue).toBeNull();
  });

  it("returns nulls rather than zeros when nothing was won", async () => {
    const user = await seedUser(h, { isAdmin: true });
    const { pipeline, stages } = await seedPipeline(h);
    const stage = stages[0];
    if (stage === undefined) throw new Error("no stage");
    await seedDeal(h, {
      title: "still open",
      status: "open",
      value: "100.00",
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: user.id,
      visibilityLevel: "all",
    });

    const r = await wonDealStats(
      h.db,
      toActor(user),
      { ...BASE, pipelineId: pipeline.id },
      new AbortController().signal,
    );
    expect(r.avgValue).toBeNull();
    expect(r.medianValue).toBeNull();
    expect(r.avgCycleDays).toBeNull();
    expect(r.medianCycleDays).toBeNull();
  });

  it("SECURITY: an owner-only won deal never reaches a third party's averages", async () => {
    const alice = await seedUser(h);
    const bob = await seedUser(h);
    const { pipeline, stages } = await seedPipeline(h);
    const stage = stages[0];
    if (stage === undefined) throw new Error("no stage");
    await seedDeal(h, {
      title: "bob's secret win",
      status: "won",
      value: "99999.00",
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: bob.id,
      visibilityLevel: "owner",
      createdAt: new Date("2025-01-01T00:00:00Z"),
      wonTime: new Date("2025-06-01T00:00:00Z"),
    });

    const r = await wonDealStats(
      h.db,
      toActor(alice),
      { ...BASE, pipelineId: pipeline.id },
      new AbortController().signal,
    );
    expect(r.avgValue).toBeNull();
  });
});
