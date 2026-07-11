// Test helpers for visibility.test.ts: db harness + inline seed functions.
// These are NOT production code; this file is only imported by test files.
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import * as schema from "@/db/schema";
import { makeTestDb, type TestDb } from "@/test/db";

export type { TestDb };

export async function openTestDb(): Promise<TestDb> {
  return makeTestDb();
}

export async function seedPipeline(h: TestDb, visibilityGroupId: string | null = null) {
  const [pipeline] = await h.db
    .insert(schema.pipelines)
    .values({ name: "Test Pipeline", visibilityGroupId })
    .returning();
  if (!pipeline)
    throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedPipeline: insert returned no rows");

  const [stage] = await h.db
    .insert(schema.stages)
    .values({ pipelineId: pipeline.id, name: "S1", order: 0 })
    .returning();
  if (!stage)
    throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedPipeline: stage insert returned no rows");

  return { pipeline, stage };
}

export async function seedUser(
  h: TestDb,
  overrides: Partial<typeof schema.users.$inferInsert> = {},
) {
  const ts = Date.now();
  const [user] = await h.db
    .insert(schema.users)
    .values({
      email: `test-${ts}-${Math.random()}@example.com`,
      name: "Test User",
      googleSub: `sub-${ts}-${Math.random()}`,
      isAdmin: false,
      ...overrides,
    })
    .returning();
  if (!user) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedUser: insert returned no rows");
  return user;
}

export async function seedVisibilityGroup(h: TestDb, name: string) {
  const [group] = await h.db.insert(schema.visibilityGroups).values({ name }).returning();
  if (!group)
    throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedVisibilityGroup: insert returned no rows");
  return group;
}
