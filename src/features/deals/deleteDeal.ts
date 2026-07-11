import { eq, sql } from "drizzle-orm";
import { BOARD_EVENT, dealChannel, dealMovedChannel } from "@/constants/boardChannels";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { deals } from "@/db/schema";
import { recordChange } from "@/features/collaboration/changeLog";
import { loadEditableDeal, toVisibleDeal } from "@/features/deals/dealAuth";
import { can } from "@/features/permissions/can";
import type { PermSetUser } from "@/features/permissions/effective";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import { publishBoardEvent } from "@/server/realtime/events";
import { err, ok, type Result } from "@/types/result";

// Soft-delete a deal. loadEditableDeal 404s on invisible/already-deleted and enforces
// deal.edit; deal.delete is a distinct withheld flag, so it is checked on top (mirrors how
// deletePerson layers contact.delete over visibility). Backfills the delete path that the
// existing but unused deal.delete flag always implied.
export async function deleteDeal(
  db: DbOrTx,
  actor: PermSetUser,
  dealId: string,
  signal: AbortSignal,
): Promise<Result<{ id: string }, AppError>> {
  return db.transaction(async (tx) => {
    const editable = await loadEditableDeal(tx, actor, dealId, signal);
    if (editable.ok === false) return editable;
    const visible = toVisibleDeal(editable.value.deal, editable.value.pipelineVisibilityGroupId);
    if (!can(actor, "deal.delete", visible)) {
      return err(new AppError(ERROR_IDS.PERM_DENIED, "deal.delete required", { dealId }));
    }

    const [row] = await tx
      .update(deals)
      .set({ deletedAt: sql`now()` })
      .where(eq(deals.id, dealId))
      .returning({ id: deals.id });
    if (row === undefined) {
      throw new AppError(
        ERROR_IDS.DB_INVARIANT,
        "deleteDeal: UPDATE RETURNING produced undefined",
        {
          dealId,
        },
      );
    }

    await recordChange(
      tx,
      {
        entityType: "deal",
        entityId: dealId,
        field: "deleted",
        oldValue: false,
        newValue: true,
        actorId: actor.id,
      },
      signal,
    );
    await publishBoardEvent(
      tx,
      {
        channel: dealChannel(dealId),
        type: BOARD_EVENT.dealUpdated,
        actorId: actor.id,
        data: { dealId },
      },
      signal,
    );
    await publishBoardEvent(
      tx,
      {
        channel: dealMovedChannel(editable.value.deal.pipelineId),
        type: BOARD_EVENT.dealUpdated,
        actorId: actor.id,
        data: { dealId, pipelineId: editable.value.deal.pipelineId },
      },
      signal,
    );
    return ok(row);
  });
}
