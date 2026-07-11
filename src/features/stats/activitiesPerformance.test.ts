// activitiesPerformance security test. Covers the highest-residual-risk code:
// the d2/p2 correlated sub-select that applies the deal visibility predicate.
// Non-vacuous: dropping the sub-select predicate makes both counts 1.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import * as schema from "@/db/schema";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb, type TestDb } from "@/test/db";
import type { DashboardFilters } from "@/types/stats";
import { activitiesPerformance } from "./activitiesPerformance";

let h: TestDb;

beforeAll(async () => {
  h = await makeTestDb();
});

afterAll(async () => {
  await h.close();
});

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

async function seedActivityType() {
  const ts = Date.now();
  const [type] = await h.db
    .insert(schema.activityTypes)
    .values({ key: `call-${ts}-${Math.random().toString(36).slice(2)}`, name: "Call" })
    .returning();
  if (!type) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedActivityType: no rows");
  return type;
}

async function seedPipeline() {
  const [pipeline] = await h.db
    .insert(schema.pipelines)
    .values({ name: `Pipeline-${Date.now()}` })
    .returning();
  if (!pipeline) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedPipeline: no rows");
  const [stage] = await h.db
    .insert(schema.stages)
    .values({ pipelineId: pipeline.id, name: "S0", order: 0 })
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

describe("activitiesPerformance", () => {
  // SECURITY: an activity linked to another user's owner-only deal must be invisible.
  it("SECURITY: activity on an owner-only deal is excluded from a third party's counts", async () => {
    const owner = await seedUser();
    const thirdParty = await seedUser();
    const type = await seedActivityType();
    const { pipeline, stage } = await seedPipeline();

    const [deal] = await h.db
      .insert(schema.deals)
      .values({
        title: "owner-only deal",
        status: "open",
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: owner.id,
        visibilityLevel: "owner",
      })
      .returning();
    if (!deal) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "deal: no rows");

    // Activity linked to the owner-only deal, due inside the window, assigned to owner.
    await h.db.insert(schema.activities).values({
      typeId: type.id,
      subject: "secret call",
      dueAt: new Date("2025-06-01T00:00:00Z"),
      ownerId: owner.id,
      assigneeId: owner.id,
      dealId: deal.id,
    });

    const result = await activitiesPerformance(
      h.db,
      toActor(thirdParty),
      BASE_FILTERS,
      new AbortController().signal,
    );

    // Third party cannot see the owner-only deal, so its activity contributes nothing.
    expect(result.scheduled).toBe(0);
    expect(result.completed).toBe(0);
  });

  it("counts a visible-deal activity (completed subset of scheduled)", async () => {
    const user = await seedUser({ isAdmin: true });
    const type = await seedActivityType();
    const { pipeline, stage } = await seedPipeline();

    const [deal] = await h.db
      .insert(schema.deals)
      .values({
        title: "visible deal",
        status: "open",
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: user.id,
        visibilityLevel: "all",
      })
      .returning();
    if (!deal) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "deal: no rows");

    await h.db.insert(schema.activities).values([
      {
        typeId: type.id,
        subject: "done call",
        dueAt: new Date("2025-06-01T00:00:00Z"),
        done: true,
        doneAt: new Date("2025-06-01T01:00:00Z"),
        ownerId: user.id,
        assigneeId: user.id,
        dealId: deal.id,
      },
      {
        typeId: type.id,
        subject: "pending call",
        dueAt: new Date("2025-06-02T00:00:00Z"),
        ownerId: user.id,
        assigneeId: user.id,
        dealId: deal.id,
      },
    ]);

    // Scope to this test's pipeline: the shared test DB also holds the SECURITY
    // test's activity, and this user is an admin (sees all deals), so without a
    // pipeline filter that activity would leak into the count.
    const result = await activitiesPerformance(
      h.db,
      toActor(user),
      { ...BASE_FILTERS, pipelineId: pipeline.id },
      new AbortController().signal,
    );

    expect(result.scheduled).toBe(2);
    expect(result.completed).toBe(1);
  });
});
