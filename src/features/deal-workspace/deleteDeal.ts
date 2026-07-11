// deleteDeal: soft-delete for the deal header. Stamps deleted_at under a CAS precondition
// so a stale header cannot delete a concurrently-modified deal. A soft-deleted deal is
// hidden from every read path (loadEditableDeal + getWorkspace filter deletedAt), so this
// is the single write that removes a deal from the product. Mirrors moveDeal's CAS shape.
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

  // loadEditableDeal is the visibility + edit-auth choke point (404s on invisible/deleted).
  const editable = await loadEditableDeal(db, actor, input.dealId, signal);
  if (editable.ok === false) return editable;

  // Delete is a DISTINCT capability from edit (PERMISSIONS-05): a user with edit_own/edit_any
  // must not delete unless they also hold deal.delete_own (owner) or deal.delete_any. Gate on
  // it here, above the write, so the edit choke point can never double as a delete backdoor.
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

    // ALSO publish on the pipeline channel: the board subscribes only to pipeline:<id>,
    // so without this a live delete never reaches it. deal_updated maps to an invalidate
    // in the reducer, and the board read filters deleted_at, so the card drops on refetch.
    // Keeping board-affecting events on the one channel preserves seq-gap detection.
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
