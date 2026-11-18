import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { BOARD_EVENT, dealChannel, dealMovedChannel } from "@/constants/boardChannels";
import type { AppError } from "@/constants/errorIds";
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
  archived: z.boolean().default(true),
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
    const editable = await loadEditableDeal(tx, actor, input.dealId, signal);
    if (editable.ok === false) return editable;

    const current = editable.value.deal;
    const wasArchived = current.archivedAt !== null;
    if (wasArchived === input.archived) return ok(current);

    const [row] = await tx
      .update(deals)
      .set({ archivedAt: input.archived ? sql`now()` : null })
      .where(
        and(
          eq(deals.id, input.dealId),
          input.archived ? isNull(deals.archivedAt) : isNotNull(deals.archivedAt),
        ),
      )
      .returning();
    if (row === undefined) return ok(current);

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
