import { and, eq, sql } from "drizzle-orm";
import { BOARD_EVENT, dealMovedChannel } from "@/constants/boardChannels";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { deals } from "@/db/schema/deals";
import { stages } from "@/db/schema/stages";
import { recordChange } from "@/features/collaboration/changeLog";
import type { PermSetUser } from "@/features/permissions/effective";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import { publishBoardEvent } from "@/server/realtime/events";
import { err, ok, type Result } from "@/types/result";
import { midpoint } from "./boardPosition";
import { loadEditableDeal } from "./dealAuth";
import { dealMoveInput } from "./schemas";

export async function moveDeal(
  db: DbOrTx,
  session: PermSetUser,
  raw: unknown,
  signal: AbortSignal,
): Promise<Result<typeof deals.$inferSelect, AppError>> {
  const input = dealMoveInput.parse(raw);
  signal.throwIfAborted();

  const editable = await loadEditableDeal(db, session, input.dealId, signal);
  if (editable.ok === false) return editable;
  const { deal } = editable.value;

  const [stage] = await db
    .select({ id: stages.id })
    .from(stages)
    .where(and(eq(stages.id, input.toStageId), eq(stages.pipelineId, deal.pipelineId)));
  if (stage === undefined) {
    return err(
      new AppError(ERROR_IDS.DEAL_STAGE_MISMATCH, "Stage does not belong to the deal's pipeline", {
        stageId: input.toStageId,
        pipelineId: deal.pipelineId,
      }),
    );
  }
  signal.throwIfAborted();

  const position = midpoint(input.beforePosition, input.afterPosition);
  const expectedIso = input.expectedUpdatedAt;

  return db.transaction(async (tx) => {
    const updated = await tx
      .update(deals)
      .set({
        stageId: input.toStageId,
        boardPosition: position,
        stageEnteredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(deals.id, input.dealId),
          sql`date_trunc('milliseconds', ${deals.updatedAt}) = ${expectedIso}::timestamptz`,
        ),
      )
      .returning();

    if (updated.length === 0) {
      return err(
        new AppError(ERROR_IDS.DEAL_PRECONDITION, "Deal was modified by a concurrent request", {
          dealId: input.dealId,
        }),
      );
    }

    const row = updated[0];
    if (row === undefined) {
      throw new AppError(ERROR_IDS.DB_INVARIANT, "moveDeal: UPDATE RETURNING produced undefined");
    }

    if (row.stageId !== deal.stageId) {
      await recordChange(
        tx,
        {
          entityType: "deal",
          entityId: input.dealId,
          field: "stageId",
          oldValue: deal.stageId,
          newValue: row.stageId,
          actorId: session.id,
        },
        signal,
      );
    }

    await publishBoardEvent(
      tx,
      {
        channel: dealMovedChannel(deal.pipelineId),
        type: BOARD_EVENT.dealMoved,
        actorId: session.id,
        data: {
          dealId: row.id,
          fromStageId: deal.stageId,
          toStageId: row.stageId,
          boardPosition: row.boardPosition,
        },
      },
      signal,
    );

    return ok(row);
  });
}
