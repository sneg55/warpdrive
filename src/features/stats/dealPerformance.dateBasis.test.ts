import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import * as schema from "@/db/schema";
import { makeTestDb, type TestDb } from "@/test/db";
import type { DashboardFilters } from "@/types/stats";
import { dealPerformance } from "./dealPerformance";
import { EVERYONE, onlyOwners } from "./ownerIds";
import * as seed from "./statsTestHelpers";

let h: TestDb;

beforeAll(async () => {
  h = await makeTestDb();
});

afterAll(async () => {
  await h.close();
});

const toActor = seed.toActor;

function seedUser(overrides: Partial<typeof schema.users.$inferInsert> = {}) {
  return seed.seedUser(h, overrides);
}

async function seedPipeline() {
  const { pipeline, stages } = await seed.seedPipeline(h);
  const stage = stages[0];
  if (!stage) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedPipeline: no stage");
  return { pipeline, stage };
}

const BASE_FILTERS: DashboardFilters = {
  pipelineId: null,
  owners: EVERYONE,
  from: "2020-01-01",
  to: "2030-12-31",
  timeZone: "UTC",
};

describe("dealPerformance date basis", () => {
  const Y2025 = { from: "2025-01-01", to: "2025-12-31" };

  it("counts a deal won inside the range even though it was created years earlier", async () => {
    const user = await seedUser({ isAdmin: true });
    const { pipeline, stage } = await seedPipeline();
    await h.db.insert(schema.deals).values({
      title: "long sale",
      status: "won",
      value: "1000.00",
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: user.id,
      visibilityLevel: "all",
      createdAt: new Date("2019-03-01T00:00:00Z"),
      wonTime: new Date("2025-06-15T00:00:00Z"),
    });

    const r = await dealPerformance(
      h.db,
      toActor(user),
      { ...BASE_FILTERS, ...Y2025, pipelineId: pipeline.id },
      new AbortController().signal,
    );
    expect(r.won.count).toBe(1);
    expect(Number(r.won.value)).toBe(1000);
  });

  it("excludes a deal created inside the range but won after it", async () => {
    const user = await seedUser({ isAdmin: true });
    const { pipeline, stage } = await seedPipeline();
    await h.db.insert(schema.deals).values({
      title: "won later",
      status: "won",
      value: "500.00",
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: user.id,
      visibilityLevel: "all",
      createdAt: new Date("2025-11-01T00:00:00Z"),
      wonTime: new Date("2026-02-01T00:00:00Z"),
    });

    const r = await dealPerformance(
      h.db,
      toActor(user),
      { ...BASE_FILTERS, ...Y2025, pipelineId: pipeline.id },
      new AbortController().signal,
    );
    expect(r.won.count).toBe(0);
  });

  it("counts a deal lost inside the range by its lost time", async () => {
    const user = await seedUser({ isAdmin: true });
    const { pipeline, stage } = await seedPipeline();
    await h.db.insert(schema.deals).values({
      title: "lost one",
      status: "lost",
      value: "300.00",
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: user.id,
      visibilityLevel: "all",
      createdAt: new Date("2019-01-01T00:00:00Z"),
      lostTime: new Date("2025-04-01T00:00:00Z"),
    });

    const r = await dealPerformance(
      h.db,
      toActor(user),
      { ...BASE_FILTERS, ...Y2025, pipelineId: pipeline.id },
      new AbortController().signal,
    );
    expect(r.lost.count).toBe(1);
    expect(Number(r.lost.value)).toBe(300);
  });

  it("reports deals added by creation date, separately from won and lost", async () => {
    const user = await seedUser({ isAdmin: true });
    const { pipeline, stage } = await seedPipeline();
    await h.db.insert(schema.deals).values([
      {
        title: "added in range",
        status: "open",
        value: "10.00",
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: user.id,
        visibilityLevel: "all",
        createdAt: new Date("2025-05-01T00:00:00Z"),
      },
      {
        title: "added before range",
        status: "open",
        value: "20.00",
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: user.id,
        visibilityLevel: "all",
        createdAt: new Date("2019-05-01T00:00:00Z"),
      },
    ]);

    const r = await dealPerformance(
      h.db,
      toActor(user),
      { ...BASE_FILTERS, ...Y2025, pipelineId: pipeline.id },
      new AbortController().signal,
    );
    expect(r.added.count).toBe(1);
    expect(Number(r.added.value)).toBe(10);
  });

  it("reports open deals as an unwindowed snapshot, not filtered by the range", async () => {
    const user = await seedUser({ isAdmin: true });
    const { pipeline, stage } = await seedPipeline();
    await h.db.insert(schema.deals).values({
      title: "old but still open",
      status: "open",
      value: "77.00",
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: user.id,
      visibilityLevel: "all",
      createdAt: new Date("2019-05-01T00:00:00Z"),
    });

    const r = await dealPerformance(
      h.db,
      toActor(user),
      { ...BASE_FILTERS, ...Y2025, pipelineId: pipeline.id },
      new AbortController().signal,
    );
    expect(r.open.count).toBe(1);
    expect(Number(r.open.value)).toBe(77);
  });

  it("scopes to another owner's deals when the owner list names them", async () => {
    const alice = await seedUser();
    const bob = await seedUser();
    const { pipeline, stage } = await seedPipeline();

    await h.db.insert(schema.deals).values([
      {
        title: "Alice open",
        status: "open",
        value: "200.00",
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: alice.id,
        visibilityLevel: "all",
      },
      {
        title: "Bob open",
        status: "open",
        value: "300.00",
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: bob.id,
        visibilityLevel: "all",
      },
    ]);

    const result = await dealPerformance(
      h.db,
      toActor(alice),
      { ...BASE_FILTERS, pipelineId: pipeline.id, owners: onlyOwners([bob.id]) },
      new AbortController().signal,
    );

    expect(Number(result.open.value)).toBe(300);
  });

  it("counts nothing when the owner list is empty", async () => {
    const alice = await seedUser();
    const { pipeline, stage } = await seedPipeline();

    await h.db.insert(schema.deals).values({
      title: "Alice open",
      status: "open",
      value: "200.00",
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: alice.id,
      visibilityLevel: "all",
    });

    const result = await dealPerformance(
      h.db,
      toActor(alice),
      { ...BASE_FILTERS, pipelineId: pipeline.id, owners: onlyOwners([]) },
      new AbortController().signal,
    );

    expect(result.open.count).toBe(0);
    expect(Number(result.open.value)).toBe(0);
  });
});
