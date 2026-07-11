// Funnel security + owner-scope tests. Both assertions are non-vacuous: each
// would become a non-zero `reached` if the visibility predicate (SECURITY) or
// the owner filter (OWNER-SCOPE) were absent.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import * as schema from "@/db/schema";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb, type TestDb } from "@/test/db";
import { funnel } from "./funnel";

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

async function seedPipelineWith2Stages() {
  const [pipeline] = await h.db
    .insert(schema.pipelines)
    .values({ name: `Pipeline-${Date.now()}` })
    .returning();
  if (!pipeline) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedPipeline: no rows");
  const stageRows = await h.db
    .insert(schema.stages)
    .values([
      { pipelineId: pipeline.id, name: "S0", order: 0 },
      { pipelineId: pipeline.id, name: "S1", order: 1 },
    ])
    .returning();
  if (stageRows.length !== 2) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedStages: count");
  return { pipeline, stages: stageRows };
}

describe("funnel", () => {
  // SECURITY: another user's owner-only deal must not appear in a third party's funnel.
  it("SECURITY: owner-only deal from another user contributes 0 to reached", async () => {
    const owner = await seedUser();
    const thirdParty = await seedUser();
    const { pipeline, stages } = await seedPipelineWith2Stages();
    const stage0 = stages[0];
    if (!stage0) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "stage0 missing");

    await h.db.insert(schema.deals).values({
      title: "owner-only",
      status: "open",
      value: "500.00",
      pipelineId: pipeline.id,
      stageId: stage0.id,
      ownerId: owner.id,
      visibilityLevel: "owner",
    });

    const result = await funnel(
      h.db,
      toActor(thirdParty),
      pipeline.id,
      "all",
      new AbortController().signal,
    );
    const s0 = result.find((s) => s.stageId === stage0.id);
    expect(s0?.reached).toBe(0);
  });

  // OWNER-SCOPE: a co-worker's visibility_level='all' deal must be excluded when scope='me'.
  it("OWNER-SCOPE: co-worker's all-visible deal contributes 0 when scope is 'me'", async () => {
    const coworker = await seedUser();
    const viewer = await seedUser();
    const { pipeline, stages } = await seedPipelineWith2Stages();
    const stage0 = stages[0];
    if (!stage0) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "stage0 missing");

    // Co-worker's deal is visible to everyone, but viewer queries with ownerScope='me'.
    await h.db.insert(schema.deals).values({
      title: "coworker all-visible",
      status: "open",
      value: "700.00",
      pipelineId: pipeline.id,
      stageId: stage0.id,
      ownerId: coworker.id,
      visibilityLevel: "all",
    });

    const result = await funnel(
      h.db,
      toActor(viewer),
      pipeline.id,
      "me",
      new AbortController().signal,
    );
    const s0 = result.find((s) => s.stageId === stage0.id);
    // Without the owner filter this would be 1 (the deal is visible to all).
    expect(s0?.reached).toBe(0);
  });
});
