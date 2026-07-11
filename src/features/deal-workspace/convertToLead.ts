// convertDealToLead: turn a deal back into a Leads-Inbox lead (mirror of the leads feature's
// lead -> deal convert direction). Creates a lead carrying the deal's core fields, then CLOSES the
// deal by archiving it (deals have no pipeline-less "converted" state, so archive is the close),
// all in one transaction. CAS-locked on the deal's updatedAt so a stale header cannot convert a
// concurrently-modified deal. Logs the conversion on both entities.
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { BOARD_EVENT, dealChannel, dealMovedChannel } from "@/constants/boardChannels";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { deals } from "@/db/schema/deals";
import { leads } from "@/db/schema/leads";
import { recordChange } from "@/features/collaboration/changeLog";
import { loadEditableDeal } from "@/features/deals/dealAuth";
import type { PermSetUser } from "@/features/permissions/effective";
import { publishBoardEvent } from "@/server/realtime/events";
import { err, ok, type Result } from "@/types/result";

export const convertDealToLeadInput = z.object({
  dealId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime(), // ISO; compare-and-swap precondition on the deal
});
export type ConvertDealToLeadInput = z.infer<typeof convertDealToLeadInput>;

// Thrown inside the transaction to roll back the lead insert when the deal's CAS lock loses.
class ConvertConflict extends Error {}

export async function convertDealToLead(
  db: Db,
  actor: PermSetUser,
  raw: unknown,
  signal: AbortSignal,
): Promise<Result<{ leadId: string }, AppError>> {
  const input = convertDealToLeadInput.parse(raw);
  signal.throwIfAborted();

  // Visibility + edit gate on the deal (404-on-invisible, PERM_DENIED-on-unowned) so only an
  // editor can close it. Also yields the loaded row we clone into the lead.
  const editable = await loadEditableDeal(db, actor, input.dealId, signal);
  if (!editable.ok) return editable;
  const deal = editable.value.deal;

  // An already-archived deal is closed: converting again would insert a second lead for the same
  // source (loadEditableDeal filters only deletedAt, and conversion stamps only archivedAt, so a
  // stale header could re-run this). Refuse before touching anything.
  if (deal.archivedAt !== null) {
    return err(
      new AppError(ERROR_IDS.DEAL_PRECONDITION, "Deal already archived (cannot convert)", {
        dealId: deal.id,
      }),
    );
  }

  // Creating the lead requires the global deal.create capability (leads share it). Admin bypasses.
  if (actor.type !== "admin" && !actor.flags.has("deal.create")) {
    return err(
      new AppError(ERROR_IDS.PERM_DENIED, "deal.create capability required", { userId: actor.id }),
    );
  }
  signal.throwIfAborted();

  try {
    return await db.transaction(async (tx) => {
      const [lead] = await tx
        .insert(leads)
        .values({
          title: deal.title,
          value: deal.value,
          personId: deal.personId,
          orgId: deal.orgId,
          expectedCloseDate: deal.expectedCloseDate,
          labels: deal.labels,
          sourceChannel: deal.sourceChannel,
          sourceChannelId: deal.sourceChannelId,
          ownerId: deal.ownerId,
          // Inherit the deal's visibility so the conversion neither broadens nor narrows exposure.
          visibilityLevel: deal.visibilityLevel,
          visibilityGroupId: deal.visibilityGroupId,
          visibleToUserIds: deal.visibleToUserIds,
        })
        .returning({ id: leads.id });
      if (lead === undefined) {
        throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "convertDealToLead: lead insert no rows");
      }

      // CAS-close the deal: archive it under the updatedAt precondition.
      const now = new Date();
      const [closed] = await tx
        .update(deals)
        .set({ archivedAt: now, updatedAt: now })
        .where(
          and(
            eq(deals.id, deal.id),
            isNull(deals.archivedAt), // lose the race to a concurrent archive/convert
            sql`date_trunc('milliseconds', ${deals.updatedAt}) = ${input.expectedUpdatedAt}::timestamptz`,
          ),
        )
        .returning({ id: deals.id });
      if (closed === undefined) throw new ConvertConflict();

      await recordChange(
        tx,
        {
          entityType: "deal",
          entityId: deal.id,
          field: "convertedToLeadId",
          oldValue: null,
          newValue: lead.id,
          actorId: actor.id,
        },
        signal,
      );
      await recordChange(
        tx,
        {
          entityType: "lead",
          entityId: lead.id,
          field: "createdFromDealId",
          oldValue: null,
          newValue: deal.id,
          actorId: actor.id,
        },
        signal,
      );

      // Realtime: the deal is now archived (dropped from active board reads). Notify the deal
      // channel and the pipeline channel so open views refetch.
      await publishBoardEvent(
        tx,
        {
          channel: dealChannel(deal.id),
          type: BOARD_EVENT.dealUpdated,
          actorId: actor.id,
          data: { dealId: deal.id },
        },
        signal,
      );
      await publishBoardEvent(
        tx,
        {
          channel: dealMovedChannel(deal.pipelineId),
          type: BOARD_EVENT.dealUpdated,
          actorId: actor.id,
          data: { dealId: deal.id, pipelineId: deal.pipelineId },
        },
        signal,
      );

      return ok({ leadId: lead.id });
    });
  } catch (e) {
    if (e instanceof ConvertConflict) {
      return err(
        new AppError(ERROR_IDS.DEAL_PRECONDITION, "Deal changed before convert (stale)", {
          dealId: deal.id,
        }),
      );
    }
    throw e;
  }
}
