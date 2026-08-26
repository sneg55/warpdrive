// RED-first security test: verify user A cannot see user B's owner-only deal.
// The security assertion MUST fail if dealVisibilityClause is removed from the query.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import * as schema from "@/db/schema";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb, type TestDb } from "@/test/db";
import type { DashboardFilters } from "@/types/stats";
import { dealPerformance } from "./dealPerformance";

let h: TestDb;

beforeAll(async () => {
  h = await makeTestDb();
});

afterAll(async () => {
  await h.close();
});

// Build a PermSetUser for a DB user row.
function toActor(user: typeof schema.users.$inferSelect): PermSetUser {
  return {
    id: user.id,
    type: user.isAdmin ? "admin" : "regular",
    isActive: user.isActive,
    groupIds: new Set<string>(),
    flags: new Set(),
  };
}

async function seedUser(overrides: Partial<typeof schema.users.$inferInsert> = {}) {
  const ts = Date.now();
  const [user] = await h.db
    .insert(schema.users)
    .values({
      email: `test-${ts}-${Math.random().toString(36).slice(2)}@example.com`,
      name: "Test User",
      googleSub: `sub-${ts}-${Math.random().toString(36).slice(2)}`,
      isAdmin: false,
      ...overrides,
    })
    .returning();
  if (!user) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedUser: no rows");
  return user;
}

async function seedPipeline(visibilityGroupId: string | null = null) {
  const [pipeline] = await h.db
    .insert(schema.pipelines)
    .values({ name: `Pipeline-${Date.now()}`, visibilityGroupId })
    .returning();
  if (!pipeline) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedPipeline: no rows");
  const [stage] = await h.db
    .insert(schema.stages)
    .values({ pipelineId: pipeline.id, name: "S1", order: 0 })
    .returning();
  if (!stage) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedStage: no rows");
  return { pipeline, stage };
}

const BASE_FILTERS: DashboardFilters = {
  pipelineId: null,
  ownerScope: "all",
  from: "2020-01-01",
  to: "2030-12-31",
};

describe("dealPerformance", () => {
  it("counts and sums won deals for admin", async () => {
    const user = await seedUser({ isAdmin: true });
    const { pipeline, stage } = await seedPipeline();

    await h.db.insert(schema.deals).values([
      {
        title: "W1",
        status: "won",
        value: "100.00",
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: user.id,
        visibilityLevel: "all",
        wonTime: new Date("2025-06-01T00:00:00Z"),
      },
      {
        title: "W2",
        status: "won",
        value: "50.00",
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: user.id,
        visibilityLevel: "all",
        wonTime: new Date("2025-06-02T00:00:00Z"),
      },
    ]);

    const result = await dealPerformance(
      h.db,
      toActor(user),
      { ...BASE_FILTERS, pipelineId: pipeline.id },
      new AbortController().signal,
    );

    expect(result.won.count).toBeGreaterThanOrEqual(2);
    expect(Number(result.won.value)).toBeGreaterThanOrEqual(150);
  });

  // SECURITY: user A must NOT see user B's owner-only deals in performance counts.
  // If dealVisibilityClause is removed from the query, B's deal leaks into A's stats.
  it("SECURITY: owner-only deal is invisible to a third party", async () => {
    const alice = await seedUser();
    const bob = await seedUser();
    const { pipeline, stage } = await seedPipeline();

    // Bob's won deal: visibilityLevel 'owner' means only Bob can see it.
    await h.db.insert(schema.deals).values({
      title: "Bob secret won",
      status: "won",
      value: "9999.00",
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: bob.id,
      visibilityLevel: "owner",
      wonTime: new Date("2025-06-01T00:00:00Z"),
    });

    const aliceResult = await dealPerformance(
      h.db,
      toActor(alice),
      { ...BASE_FILTERS, pipelineId: pipeline.id },
      new AbortController().signal,
    );

    // Alice must see 0 won deals in this pipeline (Bob's is owner-only).
    expect(aliceResult.won.count).toBe(0);
    expect(Number(aliceResult.won.value)).toBe(0);
  });

  it("owner scope 'me' filters to the actor's own deals only", async () => {
    const alice = await seedUser();
    const bob = await seedUser();
    const { pipeline, stage } = await seedPipeline();

    // Alice's open deal (visible to all).
    await h.db.insert(schema.deals).values({
      title: "Alice open",
      status: "open",
      value: "200.00",
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: alice.id,
      visibilityLevel: "all",
    });
    // Bob's open deal (also visible to all).
    await h.db.insert(schema.deals).values({
      title: "Bob open",
      status: "open",
      value: "300.00",
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: bob.id,
      visibilityLevel: "all",
    });

    const aliceResult = await dealPerformance(
      h.db,
      toActor(alice),
      { ...BASE_FILTERS, pipelineId: pipeline.id, ownerScope: "me" },
      new AbortController().signal,
    );

    // Alice's me-scope: only her own deal (200), not Bob's (300).
    expect(Number(aliceResult.open.value)).toBe(200);
  });
});

// A: each counter windows on the column that records the event it counts.
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
});
