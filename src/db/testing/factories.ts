import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import * as schema from "@/db/schema";

type Db = NodePgDatabase<typeof schema>;

export async function seedUser(
  db: Db,
  overrides?: Partial<typeof schema.users.$inferInsert>,
): Promise<typeof schema.users.$inferSelect> {
  const users = await db
    .insert(schema.users)
    .values({
      email: `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      name: "Test User",
      googleSub: `sub-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      isAdmin: false,
      ...overrides,
    })
    .returning();
  if (users.length === 0) {
    throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedUser: insert returned no rows");
  }
  const user = users[0];
  if (!user) {
    throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedUser: insert returned undefined");
  }
  return user;
}

export interface SeededPipeline {
  pipeline: typeof schema.pipelines.$inferSelect;
  stages: Array<typeof schema.stages.$inferSelect>;
}

// Insert a pipeline with the given stage names (in order) and return both.
export async function seedPipelineWithStages(
  db: Db,
  stageNames: string[],
  pipelineOverrides?: Partial<typeof schema.pipelines.$inferInsert>,
): Promise<SeededPipeline> {
  const [pipeline] = await db
    .insert(schema.pipelines)
    .values({
      name: `Pipeline-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ...pipelineOverrides,
    })
    .returning();
  if (!pipeline) {
    throw new AppError(
      ERROR_IDS.DB_INSERT_FAILED,
      "seedPipelineWithStages: pipeline insert returned no rows",
    );
  }
  const stageRows = await db
    .insert(schema.stages)
    .values(
      stageNames.map((name, i) => ({
        name,
        pipelineId: pipeline.id,
        order: i,
      })),
    )
    .returning();
  if (stageRows.length !== stageNames.length) {
    throw new AppError(
      ERROR_IDS.DB_INSERT_FAILED,
      "seedPipelineWithStages: stages insert row count mismatch",
    );
  }
  return { pipeline, stages: stageRows };
}
