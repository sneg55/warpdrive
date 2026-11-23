import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import * as schema from "@/db/schema";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb, type TestDb } from "@/test/db";
import { EVERYONE, onlyOwners } from "./ownerIds";
import { stageSums } from "./stageSums";

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
  return pipeline;
}

async function seedStage(pipelineId: string, name: string, order: number) {
  const [stage] = await h.db.insert(schema.stages).values({ pipelineId, name, order }).returning();
  if (!stage) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedStage: no rows");
  return stage;
}

describe("stageSums", () => {
  it("returns the stage name alongside the sum for a non-default pipeline", async () => {
    const admin = await seedUser({ isAdmin: true });
    const pipeline = await seedPipeline();
    const stage = await seedStage(pipeline.id, "Negotiation", 0);

    await h.db.insert(schema.deals).values({
      title: "D1",
      status: "open",
      value: "100.00",
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: admin.id,
      visibilityLevel: "all",
    });

    const sums = await stageSums(
      h.db,
      toActor(admin),
      pipeline.id,
      EVERYONE,
      new AbortController().signal,
    );
    const row = sums.find((s) => s.stageId === stage.id);
    expect(row?.name).toBe("Negotiation");
  });

  it("sums open deal values per stage for visible deals", async () => {
    const admin = await seedUser({ isAdmin: true });
    const pipeline = await seedPipeline();
    const stage = await seedStage(pipeline.id, "S1", 0);

    await h.db.insert(schema.deals).values([
      {
        title: "D1",
        status: "open",
        value: "100.00",
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: admin.id,
        visibilityLevel: "all",
      },
      {
        title: "D2",
        status: "open",
        value: "50.00",
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: admin.id,
        visibilityLevel: "all",
      },
    ]);

    const sums = await stageSums(
      h.db,
      toActor(admin),
      pipeline.id,
      EVERYONE,
      new AbortController().signal,
    );
    const row = sums.find((s) => s.stageId === stage.id);
    expect(row).toBeDefined();
    expect(row?.dealCount).toBeGreaterThanOrEqual(2);
    expect(Number(row?.total)).toBeGreaterThanOrEqual(150);
  });

  it("excludes closed (won/lost) deals from sums", async () => {
    const admin = await seedUser({ isAdmin: true });
    const pipeline = await seedPipeline();
    const stage = await seedStage(pipeline.id, "S1", 0);

    await h.db.insert(schema.deals).values({
      title: "Won deal",
      status: "won",
      value: "500.00",
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: admin.id,
      visibilityLevel: "all",
    });

    const sums = await stageSums(
      h.db,
      toActor(admin),
      pipeline.id,
      EVERYONE,
      new AbortController().signal,
    );
    const row = sums.find((s) => s.stageId === stage.id);
    expect(row?.dealCount ?? 0).toBe(0);
  });

  it("SECURITY: owner-only deal from another user is excluded from stage totals", async () => {
    const alice = await seedUser();
    const bob = await seedUser();
    const pipeline = await seedPipeline();
    const stage = await seedStage(pipeline.id, "S1", 0);

    await h.db.insert(schema.deals).values({
      title: "Bob secret",
      status: "open",
      value: "999.00",
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: bob.id,
      visibilityLevel: "owner",
    });

    const sums = await stageSums(
      h.db,
      toActor(alice),
      pipeline.id,
      EVERYONE,
      new AbortController().signal,
    );
    const row = sums.find((s) => s.stageId === stage.id);
    expect(row?.dealCount ?? 0).toBe(0);
    expect(Number(row?.total ?? "0")).toBe(0);
  });

  it("ownerScope='me' counts only the actor's own deals in the stage", async () => {
    const alice = await seedUser();
    const bob = await seedUser();
    const pipeline = await seedPipeline();
    const stage = await seedStage(pipeline.id, "S1", 0);

    await h.db.insert(schema.deals).values([
      {
        title: "Alice deal",
        status: "open",
        value: "100.00",
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: alice.id,
        visibilityLevel: "all",
      },
      {
        title: "Bob deal",
        status: "open",
        value: "200.00",
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: bob.id,
        visibilityLevel: "all",
      },
    ]);

    const sums = await stageSums(
      h.db,
      toActor(alice),
      pipeline.id,
      onlyOwners([alice.id]),
      new AbortController().signal,
    );
    const row = sums.find((s) => s.stageId === stage.id);
    expect(row?.dealCount).toBe(1);
    expect(Number(row?.total)).toBe(100);
  });
});
