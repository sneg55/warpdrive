import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { BOARD_EVENT, dealChannel, dealMovedChannel } from "@/constants/boardChannels";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { deals } from "@/db/schema";
import type { Deal } from "@/db/schema/deals";
import { recordChange } from "@/features/collaboration/changeLog";
import { loadEditableDeal } from "@/features/deals/dealAuth";
import type { PermSetUser } from "@/features/permissions/effective";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import { publishBoardEvent } from "@/server/realtime/events";
import { ok, type Result } from "@/types/result";

export const dealArchiveInput = z.object({
  dealId: z.string().uuid(),
  archived: z.boolean().default(true), // false unarchives
});
export type DealArchiveInput = z.infer<typeof dealArchiveInput>;

export async function archiveDeal(
  db: DbOrTx,
  actor: PermSetUser,
  raw: DealArchiveInput,
  signal: AbortSignal,
): Promise<Result<Deal, AppError>> {
  const input = dealArchiveInput.parse(raw);
  return db.transaction(async (tx) => {
    // Same choke point as move/won/lost: 404-on-invisible, else edit-permission check.
    const editable = await loadEditableDeal(tx, actor, input.dealId, signal);
    if (editable.ok === false) return editable;

    const wasArchived = editable.value.deal.archivedAt !== null;

    const [row] = await tx
      .update(deals)
      .set({ archivedAt: input.archived ? sql`now()` : null })
      .where(eq(deals.id, input.dealId))
      .returning();
    if (row === undefined) {
      throw new AppError(
        ERROR_IDS.DB_INVARIANT,
        "archiveDeal: UPDATE RETURNING produced undefined",
        { dealId: input.dealId },
      );
    }

    // Log the transition so the deal history timeline shows archive/unarchive events,
    // consistent with how won/lost/moves are recorded.
    await recordChange(
      tx,
      {
        entityType: "deal",
        entityId: input.dealId,
        field: "archived",
        oldValue: wasArchived,
        newValue: input.archived,
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
        data: { dealId: input.dealId },
      },
      signal,
    );

    // ALSO publish on the pipeline channel: the board subscribes only to pipeline:<id>,
    // so without this a live archive never reaches it. deal_updated maps to an invalidate
    // in the reducer, and the board read filters archived_at, so the card drops on refetch.
    await publishBoardEvent(
      tx,
      {
        channel: dealMovedChannel(editable.value.deal.pipelineId),
        type: BOARD_EVENT.dealUpdated,
        actorId: actor.id,
        data: { dealId: input.dealId, pipelineId: editable.value.deal.pipelineId },
      },
      signal,
    );
    return ok(row);
  });
}
