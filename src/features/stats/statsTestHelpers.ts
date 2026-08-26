// Shared seed helpers for the stats integration tests. Each test file previously carried its
// own copy; new metric tests share these so a schema change lands in one place.
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import * as schema from "@/db/schema";
import type { PermSetUser } from "@/features/permissions/effective";
import type { TestDb } from "@/test/db";

function uniq(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function toActor(user: typeof schema.users.$inferSelect): PermSetUser {
  return {
    id: user.id,
    type: user.isAdmin ? "admin" : "regular",
    isActive: user.isActive,
    groupIds: new Set<string>(),
    flags: new Set(),
  };
}

export async function seedUser(
  h: TestDb,
  overrides: Partial<typeof schema.users.$inferInsert> = {},
) {
  const [user] = await h.db
    .insert(schema.users)
    .values({
      email: `stats-${uniq()}@example.com`,
      name: "Stats User",
      googleSub: `sub-${uniq()}`,
      isAdmin: false,
      ...overrides,
    })
    .returning();
  if (!user) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedUser: no rows");
  return user;
}

// Seeds a pipeline with `stageCount` ordered stages so funnel/stage tests have somewhere to move
// deals through. Stages come back in order.
export async function seedPipeline(h: TestDb, stageCount = 1) {
  const [pipeline] = await h.db
    .insert(schema.pipelines)
    .values({ name: `Pipeline-${uniq()}` })
    .returning();
  if (!pipeline) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedPipeline: no rows");
  const stages = await h.db
    .insert(schema.stages)
    .values(
      Array.from({ length: stageCount }, (_, i) => ({
        pipelineId: pipeline.id,
        name: `S${i}`,
        order: i,
      })),
    )
    .returning();
  return { pipeline, stages };
}

export async function seedActivityType(h: TestDb, name = "Call") {
  const [type] = await h.db
    .insert(schema.activityTypes)
    .values({ key: `type-${uniq()}`, name })
    .returning();
  if (!type) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedActivityType: no rows");
  return type;
}

export async function seedDeal(h: TestDb, values: typeof schema.deals.$inferInsert) {
  const [deal] = await h.db.insert(schema.deals).values(values).returning();
  if (!deal) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedDeal: no rows");
  return deal;
}

export async function seedPerson(h: TestDb, values: typeof schema.persons.$inferInsert) {
  const [row] = await h.db.insert(schema.persons).values(values).returning();
  if (!row) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedPerson: no rows");
  return row;
}

export async function seedOrg(h: TestDb, values: typeof schema.organizations.$inferInsert) {
  const [row] = await h.db.insert(schema.organizations).values(values).returning();
  if (!row) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedOrg: no rows");
  return row;
}
