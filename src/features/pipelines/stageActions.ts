import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { BOARD_EVENT, dealMovedChannel } from "@/constants/boardChannels";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type * as schema from "@/db/schema";
import { deals } from "@/db/schema/deals";
import { stages } from "@/db/schema/stages";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import { publishBoardEvent } from "@/server/realtime/events";
import { err, ok, type Result } from "@/types/result";
import {
  type StageDeleteInput,
  type StageUpdateInput,
  stageDeleteInput,
  stageUpdateInput,
} from "./schemas";

type Db = NodePgDatabase<typeof schema>;

interface ManageSession {
  userId: string;
  isAdmin: boolean;
  flags: Record<string, boolean>;
}

export async function updateStage(
  db: Db,
  session: ManageSession,
  raw: StageUpdateInput,
  signal: AbortSignal,
): Promise<Result<typeof stages.$inferSelect, AppError>> {
  if (!(session.isAdmin || session.flags["pipeline.manage"] === true)) {
    return err(new AppError(ERROR_IDS.PERM_DENIED, "Not permitted", { userId: session.userId }));
  }
  const input = stageUpdateInput.parse(raw);
  signal.throwIfAborted();
  const patch: Partial<typeof stages.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.rottingDays !== undefined) patch.rottingDays = input.rottingDays;
  const rows = await db.update(stages).set(patch).where(eq(stages.id, input.stageId)).returning();
  const row = rows[0];
  if (row === undefined) {
    return err(
      new AppError(ERROR_IDS.PIPELINE_NOT_FOUND, "Stage not found", { stageId: input.stageId }),
    );
  }
  return ok(row);
}

export async function deleteStage(
  db: Db,
  session: ManageSession,
  raw: StageDeleteInput,
  signal: AbortSignal,
): Promise<Result<true, AppError>> {
  if (!(session.isAdmin || session.flags["pipeline.manage"] === true)) {
    return err(new AppError(ERROR_IDS.PERM_DENIED, "Not permitted", { userId: session.userId }));
  }
  const input = stageDeleteInput.parse(raw);
  signal.throwIfAborted();

  const [target] = await db
    .select({ id: stages.id, pipelineId: stages.pipelineId })
    .from(stages)
    .where(eq(stages.id, input.stageId));
  if (target === undefined) {
    return err(
      new AppError(ERROR_IDS.STAGE_NOT_FOUND, "Stage not found", { stageId: input.stageId }),
    );
  }
  signal.throwIfAborted();

  const destination = await resolveMoveDestination(db, target, input.moveDealsToStageId);
  if (!destination.ok) return destination;
  signal.throwIfAborted();

  if (destination.value === null) {
    const dealRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(deals)
      .where(eq(deals.stageId, input.stageId));
    const dealCount = dealRows[0]?.count ?? 0;
    if (dealCount > 0) {
      return err(
        new AppError(ERROR_IDS.STAGE_HAS_DEALS, "Stage still holds deals", {
          stageId: input.stageId,
          dealCount,
        }),
      );
    }
    signal.throwIfAborted();
  }

  const stageRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(stages)
    .where(eq(stages.pipelineId, target.pipelineId));
  const stageCount = stageRows[0]?.count ?? 0;
  if (stageCount <= 1) {
    return err(
      new AppError(ERROR_IDS.STAGE_LAST_ONE, "Cannot delete the last stage", {
        pipelineId: target.pipelineId,
      }),
    );
  }
  signal.throwIfAborted();

  const moveTo = destination.value;
  if (moveTo === null) {
    await db.delete(stages).where(eq(stages.id, input.stageId));
    return ok(true);
  }
  await db.transaction(async (tx) => {
    await moveStageDealsKeepingStageClocks(tx, session, target, moveTo, signal);
    await tx.delete(stages).where(eq(stages.id, input.stageId));
  });
  return ok(true);
}

async function resolveMoveDestination(
  db: Db,
  target: { id: string; pipelineId: string },
  moveDealsToStageId: string | undefined,
): Promise<Result<string | null, AppError>> {
  if (moveDealsToStageId === undefined) return ok(null);
  const invalid = () =>
    err(
      new AppError(ERROR_IDS.STAGE_MOVE_TARGET_INVALID, "Invalid move destination", {
        stageId: target.id,
        moveDealsToStageId,
      }),
    );
  if (moveDealsToStageId === target.id) return invalid();
  const [dest] = await db
    .select({ id: stages.id, pipelineId: stages.pipelineId })
    .from(stages)
    .where(eq(stages.id, moveDealsToStageId));
  if (dest === undefined || dest.pipelineId !== target.pipelineId) return invalid();
  return ok(dest.id);
}

async function moveStageDealsKeepingStageClocks(
  tx: DbOrTx,
  session: ManageSession,
  target: { id: string; pipelineId: string },
  moveTo: string,
  signal: AbortSignal,
): Promise<void> {
  const moved = await tx
    .update(deals)
    .set({ stageId: moveTo, updatedAt: new Date() })
    .where(eq(deals.stageId, target.id))
    .returning({ id: deals.id, status: deals.status, deletedAt: deals.deletedAt });
  signal.throwIfAborted();
  for (const d of moved) {
    if (d.status !== "open" || d.deletedAt !== null) continue;
    await publishBoardEvent(
      tx,
      {
        channel: dealMovedChannel(target.pipelineId),
        type: BOARD_EVENT.dealUpdated,
        actorId: session.userId,
        data: { dealId: d.id, fromStageId: target.id, toStageId: moveTo },
      },
      signal,
    );
  }
}
