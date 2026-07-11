// changeStage: deal-header stage selector. Moves a deal to an explicit target stage,
// appending it to the bottom of that stage's column. Mirrors moveDeal's CAS + changelog
// + board-event shape; the difference is the board position is computed server-side
// (append) rather than from client-supplied neighbors.
import { and, desc, eq, sql } from "drizzle-orm";
import { BOARD_EVENT, dealMovedChannel } from "@/constants/boardChannels";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { Deal } from "@/db/schema/deals";
import { deals } from "@/db/schema/deals";
import { stages } from "@/db/schema/stages";
import { recordChange } from "@/features/collaboration/changeLog";
import { midpoint } from "@/features/deals/boardPosition";
import { loadEditableDeal } from "@/features/deals/dealAuth";
import { changeStageInput } from "@/features/deals/schemas";
import type { PermSetUser } from "@/features/permissions/effective";
import { publishBoardEvent } from "@/server/realtime/events";
import { err, ok, type Result } from "@/types/result";

export async function changeStage(
  db: Db,
  actor: PermSetUser,
  raw: unknown,
  signal: AbortSignal,
): Promise<Result<Deal, AppError>> {
  const input = changeStageInput.parse(raw);
  signal.throwIfAborted();

  // Load deal + enforce can(deal.edit) via the single shared authorization path.
  const editable = await loadEditableDeal(db, actor, input.dealId, signal);
  if (editable.ok === false) return editable;
  const { deal } = editable.value;

  // Validate toStageId belongs to the deal's pipeline (data-model §5).
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

  const expectedIso = input.expectedUpdatedAt;

  return db.transaction(async (tx) => {
    // Append: bottom of the target column (max existing position + 1, or "1" when empty).
    const [bottom] = await tx
      .select({ pos: deals.boardPosition })
      .from(deals)
      .where(and(eq(deals.stageId, input.toStageId), sql`deleted_at is null`))
      .orderBy(desc(deals.boardPosition))
      .limit(1);
    const position = midpoint(bottom?.pos ?? null, null);
    signal.throwIfAborted();

    // Atomic CAS: 0 rows means a concurrent write won; we write nothing.
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
      throw new AppError(
        ERROR_IDS.DB_INVARIANT,
        "changeStage: UPDATE RETURNING produced undefined",
      );
    }

    await recordChange(
      tx,
      {
        entityType: "deal",
        entityId: input.dealId,
        field: "stageId",
        oldValue: deal.stageId,
        newValue: row.stageId,
        actorId: actor.id,
      },
      signal,
    );

    await publishBoardEvent(
      tx,
      {
        channel: dealMovedChannel(deal.pipelineId),
        type: BOARD_EVENT.dealMoved,
        actorId: actor.id,
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
