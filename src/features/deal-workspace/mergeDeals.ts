// mergeDeals: merge source deal S into target deal T in ONE transaction. T is the survivor and
// KEEPS all of its own core field values (target-wins precedence; see the unit-D implementation
// notes); S contributes only its child rows, which are re-parented onto T (activities, notes,
// email threads, files, participants, followers, followers/participants deduped). S is then
// soft-deleted and the merge is logged on T. Both deals must be visible+editable by the actor, and
// each is CAS-locked on its updatedAt so a stale header cannot merge a concurrently-modified deal.
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { BOARD_EVENT, dealChannel, dealMovedChannel } from "@/constants/boardChannels";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { deals } from "@/db/schema/deals";
import { recordChange } from "@/features/collaboration/changeLog";
import { loadEditableDeal } from "@/features/deals/dealAuth";
import type { PermSetUser } from "@/features/permissions/effective";
import { publishBoardEvent } from "@/server/realtime/events";
import { err, ok, type Result } from "@/types/result";
import { repointDealChildren } from "./mergeReparent";

export const mergeDealsInput = z.object({
  targetDealId: z.string().uuid(),
  sourceDealId: z.string().uuid(),
  expectedTargetUpdatedAt: z.string().datetime(), // CAS precondition on T
  expectedSourceUpdatedAt: z.string().datetime(), // CAS precondition on S
});
export type MergeDealsInput = z.infer<typeof mergeDealsInput>;

// Thrown inside the transaction to roll the whole merge back when either CAS lock loses.
class MergeConflict extends Error {}

async function casTouch(
  tx: Parameters<Parameters<Db["transaction"]>[0]>[0],
  id: string,
  expected: string,
): Promise<void> {
  const now = new Date();
  const [row] = await tx
    .update(deals)
    .set({ updatedAt: now })
    .where(
      and(
        eq(deals.id, id),
        sql`date_trunc('milliseconds', ${deals.updatedAt}) = ${expected}::timestamptz`,
      ),
    )
    .returning({ id: deals.id });
  if (row === undefined) throw new MergeConflict();
}

export async function mergeDeals(
  db: Db,
  actor: PermSetUser,
  raw: unknown,
  signal: AbortSignal,
): Promise<Result<{ targetId: string }, AppError>> {
  const input = mergeDealsInput.parse(raw);
  signal.throwIfAborted();

  if (input.targetDealId === input.sourceDealId) {
    return err(
      new AppError(ERROR_IDS.DEAL_MERGE_SAME, "Cannot merge a deal into itself", {
        dealId: input.targetDealId,
      }),
    );
  }

  // Gate visibility + edit on BOTH deals (404-on-invisible, PERM_DENIED-on-unowned).
  const target = await loadEditableDeal(db, actor, input.targetDealId, signal);
  if (!target.ok) return target;
  const source = await loadEditableDeal(db, actor, input.sourceDealId, signal);
  if (!source.ok) return source;
  signal.throwIfAborted();

  try {
    return await db.transaction(async (tx) => {
      // CAS both first so a stale precondition fails before any re-parenting.
      await casTouch(tx, input.targetDealId, input.expectedTargetUpdatedAt);
      const now = new Date();
      const [deleted] = await tx
        .update(deals)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(deals.id, input.sourceDealId),
            sql`date_trunc('milliseconds', ${deals.updatedAt}) = ${input.expectedSourceUpdatedAt}::timestamptz`,
          ),
        )
        .returning({ id: deals.id });
      if (deleted === undefined) throw new MergeConflict();

      await repointDealChildren(tx, input.sourceDealId, input.targetDealId);

      await recordChange(
        tx,
        {
          entityType: "deal",
          entityId: input.targetDealId,
          field: "mergedDealId",
          oldValue: null,
          newValue: input.sourceDealId,
          actorId: actor.id,
        },
        signal,
      );

      // Realtime: T changed (absorbed children), S is gone. Notify each deal channel and the
      // pipeline channel(s) so open board/detail views refetch.
      await publishBoardEvent(
        tx,
        {
          channel: dealChannel(input.targetDealId),
          type: BOARD_EVENT.dealUpdated,
          actorId: actor.id,
          data: { dealId: input.targetDealId },
        },
        signal,
      );
      await publishBoardEvent(
        tx,
        {
          channel: dealChannel(input.sourceDealId),
          type: BOARD_EVENT.dealUpdated,
          actorId: actor.id,
          data: { dealId: input.sourceDealId },
        },
        signal,
      );
      await publishBoardEvent(
        tx,
        {
          channel: dealMovedChannel(source.value.deal.pipelineId),
          type: BOARD_EVENT.dealUpdated,
          actorId: actor.id,
          data: { dealId: input.sourceDealId, pipelineId: source.value.deal.pipelineId },
        },
        signal,
      );

      return ok({ targetId: input.targetDealId });
    });
  } catch (e) {
    if (e instanceof MergeConflict) {
      return err(
        new AppError(ERROR_IDS.DEAL_PRECONDITION, "A deal changed before merge (stale)", {
          targetDealId: input.targetDealId,
          sourceDealId: input.sourceDealId,
        }),
      );
    }
    throw e;
  }
}
