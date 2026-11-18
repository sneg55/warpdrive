import { and, eq, sql } from "drizzle-orm";
import { BOARD_EVENT, dealChannel, dealMovedChannel } from "@/constants/boardChannels";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { Deal } from "@/db/schema/deals";
import { deals } from "@/db/schema/deals";
import { recordChange } from "@/features/collaboration/changeLog";
import { loadEditableDeal, toVisibleDeal } from "@/features/deals/dealAuth";
import { deleteDealInput } from "@/features/deals/schemas";
import { can } from "@/features/permissions/can";
import type { PermSetUser } from "@/features/permissions/effective";
import { publishBoardEvent } from "@/server/realtime/events";
import { err, ok, type Result } from "@/types/result";

export async function deleteDeal(
  db: Db,
  actor: PermSetUser,
  raw: unknown,
  signal: AbortSignal,
): Promise<Result<Deal, AppError>> {
  const input = deleteDealInput.parse(raw);
  signal.throwIfAborted();

  const editable = await loadEditableDeal(db, actor, input.dealId, signal);
  if (editable.ok === false) return editable;

  const visible = toVisibleDeal(editable.value.deal, editable.value.pipelineVisibilityGroupId);
  if (!can(actor, "deal.delete", visible)) {
    return err(
      new AppError(ERROR_IDS.PERM_DENIED, "Not permitted to delete this deal", {
        userId: actor.id,
        dealId: input.dealId,
      }),
    );
  }

  const expectedIso = input.expectedUpdatedAt;

  return db.transaction(async (tx) => {
    const deletedAt = new Date();
    const updated = await tx
      .update(deals)
      .set({ deletedAt, updatedAt: deletedAt })
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
      throw new AppError(ERROR_IDS.DB_INVARIANT, "deleteDeal: UPDATE RETURNING produced undefined");
    }

    await recordChange(
      tx,
      {
        entityType: "deal",
        entityId: input.dealId,
        field: "deletedAt",
        oldValue: null,
        newValue: deletedAt.toISOString(),
        actorId: actor.id,
      },
      signal,
    );

    await publishBoardEvent(
      tx,
      {
        channel: dealChannel(input.dealId),
        type: BOARD_EVENT.dealUpdated,
        actorId: actor.id,
        data: { dealId: row.id },
      },
      signal,
    );

    await publishBoardEvent(
      tx,
      {
        channel: dealMovedChannel(editable.value.deal.pipelineId),
        type: BOARD_EVENT.dealUpdated,
        actorId: actor.id,
        data: { dealId: row.id, pipelineId: editable.value.deal.pipelineId },
      },
      signal,
    );

    return ok(row);
  });
}
