// markWon / markLost: dedicated won/lost workspace actions.
// Reuses loadEditableDeal (the single shared deal-auth authority) and mirrors the
// publishBoardEvent pattern from updateDeal so the board reflects transitions.
import { and, eq, isNull } from "drizzle-orm";
import type { z } from "zod";
import { BOARD_EVENT, dealChannel, dealMovedChannel } from "@/constants/boardChannels";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { deals, lostReasons } from "@/db/schema";
import type { Deal } from "@/db/schema/deals";
import { recordChange } from "@/features/collaboration/changeLog";
import { loadEditableDeal } from "@/features/deals/dealAuth";
import type { PermSetUser } from "@/features/permissions/effective";
import { publishBoardEvent } from "@/server/realtime/events";
import { err, ok, type Result } from "@/types/result";
import type { markLostInput } from "./dealCloseSchemas";

export async function markWon(
  db: Db,
  actor: PermSetUser,
  dealId: string,
  signal: AbortSignal,
): Promise<Result<Deal, AppError>> {
  return db.transaction(async (tx) => {
    const editable = await loadEditableDeal(tx, actor, dealId, signal);
    if (editable.ok === false) return editable;

    const oldStatus = editable.value.deal.status;

    const [row] = await tx
      .update(deals)
      .set({
        status: "won",
        wonTime: new Date(),
        lostTime: null,
        lostReason: null,
        lostReasonId: null,
      })
      .where(eq(deals.id, dealId))
      .returning();

    if (row === undefined) {
      throw new AppError(ERROR_IDS.DB_INVARIANT, "markWon: UPDATE RETURNING produced undefined", {
        dealId,
      });
    }

    await recordChange(
      tx,
      {
        entityType: "deal",
        entityId: dealId,
        field: "status",
        oldValue: oldStatus,
        newValue: "won",
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

    return ok(row);
  });
}

// Reopen a won/lost deal back to open (recovery from a mis-click, since Won/Convert commit on a
// single click). Clears the won/lost timestamps and reason, mirroring updateDeal's open transition.
// Reuses loadEditableDeal so the same edit-permission gate applies as Won/Lost.
export async function reopenDeal(
  db: Db,
  actor: PermSetUser,
  dealId: string,
  signal: AbortSignal,
): Promise<Result<Deal, AppError>> {
  return db.transaction(async (tx) => {
    const editable = await loadEditableDeal(tx, actor, dealId, signal);
    if (editable.ok === false) return editable;

    const oldStatus = editable.value.deal.status;

    const [row] = await tx
      .update(deals)
      .set({ status: "open", wonTime: null, lostTime: null, lostReason: null, lostReasonId: null })
      .where(eq(deals.id, dealId))
      .returning();

    if (row === undefined) {
      throw new AppError(
        ERROR_IDS.DB_INVARIANT,
        "reopenDeal: UPDATE RETURNING produced undefined",
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
        field: "status",
        oldValue: oldStatus,
        newValue: "open",
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

    // ALSO publish on the pipeline channel: the board subscribes only to pipeline:<id>
    // (useBoardRealtime), and a reopened deal becomes open again, so without this it would not
    // reappear on an open board until a manual refresh. Mirrors deleteDeal's dual publish.
    await publishBoardEvent(
      tx,
      {
        channel: dealMovedChannel(row.pipelineId),
        type: BOARD_EVENT.dealUpdated,
        actorId: actor.id,
        data: { dealId, pipelineId: row.pipelineId },
      },
      signal,
    );

    return ok(row);
  });
}

export type MarkLostReasonInput = Omit<z.infer<typeof markLostInput>, "dealId">;

export async function markLost(
  db: Db,
  actor: PermSetUser,
  dealId: string,
  input: MarkLostReasonInput,
  signal: AbortSignal,
): Promise<Result<Deal, AppError>> {
  return db.transaction(async (tx) => {
    const editable = await loadEditableDeal(tx, actor, dealId, signal);
    if (editable.ok === false) return editable;

    const oldStatus = editable.value.deal.status;

    // Validate the predefined reason only when one was chosen. A missing reason is allowed
    // (Pipedrive parity: a deal can be marked lost with a free-text reason, or none at all).
    if (input.lostReasonId !== null) {
      const [reason] = await tx
        .select()
        .from(lostReasons)
        .where(and(eq(lostReasons.id, input.lostReasonId), isNull(lostReasons.archivedAt)));

      if (reason === undefined) {
        return err(
          new AppError(
            ERROR_IDS.DEAL_LOST_REASON_INVALID,
            "Lost reason does not exist or is archived",
            { lostReasonId: input.lostReasonId },
          ),
        );
      }
    }

    const [row] = await tx
      .update(deals)
      .set({
        status: "lost",
        lostTime: new Date(),
        wonTime: null,
        lostReasonId: input.lostReasonId,
        lostReason: input.lostReason,
      })
      .where(eq(deals.id, dealId))
      .returning();

    if (row === undefined) {
      throw new AppError(ERROR_IDS.DB_INVARIANT, "markLost: UPDATE RETURNING produced undefined", {
        dealId,
      });
    }

    await recordChange(
      tx,
      {
        entityType: "deal",
        entityId: dealId,
        field: "status",
        oldValue: oldStatus,
        newValue: "lost",
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

    return ok(row);
  });
}
