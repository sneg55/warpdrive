import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { buildDefaultStageValues } from "@/constants/defaultCatalog";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type * as schema from "@/db/schema";
import { pipelines } from "@/db/schema/pipelines";
import { stages } from "@/db/schema/stages";
import { err, ok, type Result } from "@/types/result";
import {
  type PipelineCreateInput,
  type PipelineRenameInput,
  pipelineCreateInput,
  pipelineRenameInput,
  type StageCreateInput,
  type StageReorderInput,
  stageCreateInput,
  stageReorderInput,
} from "./schemas";

type Db = NodePgDatabase<typeof schema>;

interface ManageSession {
  userId: string;
  isAdmin: boolean;
  flags: Record<string, boolean>;
}

function canManage(s: ManageSession): boolean {
  return s.isAdmin || s.flags["pipeline.manage"] === true;
}

export async function createPipeline(
  db: Db,
  session: ManageSession,
  raw: PipelineCreateInput,
  signal: AbortSignal,
): Promise<Result<typeof pipelines.$inferSelect, AppError>> {
  if (!canManage(session)) {
    return err(new AppError(ERROR_IDS.PERM_DENIED, "Not permitted", { userId: session.userId }));
  }
  const input = pipelineCreateInput.parse(raw);
  signal.throwIfAborted();
  const rows = await db
    .insert(pipelines)
    .values({ name: input.name, visibilityGroupId: input.visibilityGroupId })
    .returning();
  const row = rows[0];
  if (row === undefined) {
    throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "createPipeline: insert returned no rows");
  }
  return ok(row);
}

// Creates a pipeline together with the default stage set, in one transaction. UI-created
// pipelines always get stages because a pipeline with zero stages renders an unusable board;
// bare createPipeline (no stages) is kept for callers that add stages themselves.
export async function createPipelineWithStages(
  db: Db,
  session: ManageSession,
  raw: PipelineCreateInput,
  signal: AbortSignal,
): Promise<Result<typeof pipelines.$inferSelect, AppError>> {
  if (!canManage(session)) {
    return err(new AppError(ERROR_IDS.PERM_DENIED, "Not permitted", { userId: session.userId }));
  }
  const input = pipelineCreateInput.parse(raw);
  signal.throwIfAborted();
  const row = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(pipelines)
      .values({ name: input.name, visibilityGroupId: input.visibilityGroupId })
      .returning();
    const pipeline = inserted[0];
    if (pipeline === undefined) {
      throw new AppError(
        ERROR_IDS.DB_INSERT_FAILED,
        "createPipelineWithStages: insert returned no rows",
      );
    }
    await tx.insert(stages).values(buildDefaultStageValues(pipeline.id));
    return pipeline;
  });
  return ok(row);
}

export async function renamePipeline(
  db: Db,
  session: ManageSession,
  raw: PipelineRenameInput,
  signal: AbortSignal,
): Promise<Result<typeof pipelines.$inferSelect, AppError>> {
  if (!canManage(session)) {
    return err(new AppError(ERROR_IDS.PERM_DENIED, "Not permitted", { userId: session.userId }));
  }
  const input = pipelineRenameInput.parse(raw);
  signal.throwIfAborted();
  const rows = await db
    .update(pipelines)
    .set({ name: input.name, updatedAt: new Date() })
    .where(eq(pipelines.id, input.pipelineId))
    .returning();
  const row = rows[0];
  if (row === undefined) {
    return err(
      new AppError(ERROR_IDS.PIPELINE_NOT_FOUND, "Pipeline not found", {
        pipelineId: input.pipelineId,
      }),
    );
  }
  return ok(row);
}

export async function createStage(
  db: Db,
  session: ManageSession,
  raw: StageCreateInput,
  signal: AbortSignal,
): Promise<Result<typeof stages.$inferSelect, AppError>> {
  if (!canManage(session)) {
    return err(new AppError(ERROR_IDS.PERM_DENIED, "Not permitted", { userId: session.userId }));
  }
  const input = stageCreateInput.parse(raw);
  signal.throwIfAborted();
  const existing = await db
    .select({ id: stages.id })
    .from(stages)
    .where(eq(stages.pipelineId, input.pipelineId));
  signal.throwIfAborted();
  const rows = await db
    .insert(stages)
    .values({
      pipelineId: input.pipelineId,
      name: input.name,
      order: existing.length,
      rottingDays: input.rottingDays,
    })
    .returning();
  const row = rows[0];
  if (row === undefined) {
    throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "createStage: insert returned no rows");
  }
  return ok(row);
}

export async function reorderStages(
  db: Db,
  session: ManageSession,
  raw: StageReorderInput,
  signal: AbortSignal,
): Promise<Result<true, AppError>> {
  if (!canManage(session)) {
    return err(new AppError(ERROR_IDS.PERM_DENIED, "Not permitted", { userId: session.userId }));
  }
  const input = stageReorderInput.parse(raw);
  signal.throwIfAborted();

  // Pre-flight ownership check: every id must belong to the named pipeline.
  // Prevents a pipeline.manage holder from renumbering another pipeline's
  // stages by passing foreign stage ids. Dedupe so a repeated id cannot
  // inflate the count and pass the guard.
  const uniqueIds = [...new Set(input.orderedStageIds)];
  const owned = await db
    .select({ id: stages.id })
    .from(stages)
    .where(and(eq(stages.pipelineId, input.pipelineId), inArray(stages.id, uniqueIds)));
  signal.throwIfAborted();
  if (owned.length !== uniqueIds.length) {
    return err(
      new AppError(ERROR_IDS.PIPELINE_NOT_FOUND, "Stage does not belong to pipeline", {
        pipelineId: input.pipelineId,
      }),
    );
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < input.orderedStageIds.length; i++) {
      const stageId = input.orderedStageIds[i];
      if (stageId === undefined) continue;
      // Defense-in-depth: also scope each UPDATE to the pipeline.
      await tx
        .update(stages)
        .set({ order: i, updatedAt: new Date() })
        .where(and(eq(stages.id, stageId), eq(stages.pipelineId, input.pipelineId)));
    }
  });
  return ok(true);
}
