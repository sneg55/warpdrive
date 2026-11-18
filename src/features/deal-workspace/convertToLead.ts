import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { BOARD_EVENT, dealChannel, dealMovedChannel } from "@/constants/boardChannels";
import {
  CHANGE_FIELD_CONVERTED_TO_LEAD,
  CHANGE_FIELD_CREATED_FROM_DEAL,
} from "@/constants/changeLogFields";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { deals } from "@/db/schema/deals";
import { leads } from "@/db/schema/leads";
import { recordChange } from "@/features/collaboration/changeLog";
import { listDefs } from "@/features/custom-fields/defsRepo";
import { loadEditableDeal } from "@/features/deals/dealAuth";
import { syncEntityLabelNames } from "@/features/labels/labelsRepo.entities";
import { carryCustomFields } from "@/features/leads/convertCustomFields";
import type { PermSetUser } from "@/features/permissions/effective";
import { publishBoardEvent } from "@/server/realtime/events";
import { err, ok, type Result } from "@/types/result";

export const convertDealToLeadInput = z.object({
  dealId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime(),
});

class ConvertConflict extends Error {}

export async function convertDealToLead(
  db: Db,
  actor: PermSetUser,
  raw: unknown,
  signal: AbortSignal,
): Promise<Result<{ leadId: string }, AppError>> {
  const input = convertDealToLeadInput.parse(raw);
  signal.throwIfAborted();

  const editable = await loadEditableDeal(db, actor, input.dealId, signal);
  if (!editable.ok) return editable;
  const deal = editable.value.deal;

  if (deal.archivedAt !== null) {
    return err(
      new AppError(ERROR_IDS.DEAL_PRECONDITION, "Deal already archived (cannot convert)", {
        dealId: deal.id,
      }),
    );
  }

  if (actor.type !== "admin" && !actor.flags.has("deal.create")) {
    return err(
      new AppError(ERROR_IDS.PERM_DENIED, "deal.create capability required", { userId: actor.id }),
    );
  }
  signal.throwIfAborted();

  const [dealDefs, leadDefs] = await Promise.all([
    listDefs(db, "deal", {}, signal),
    listDefs(db, "lead", {}, signal),
  ]);
  const customFields = carryCustomFields(
    dealDefs,
    leadDefs,
    deal.customFields as Record<string, unknown>,
  );

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
          customFields,
          sourceChannel: deal.sourceChannel,
          sourceChannelId: deal.sourceChannelId,
          ownerId: deal.ownerId,
          visibilityLevel: deal.visibilityLevel,
          visibilityGroupId: deal.visibilityGroupId,
          visibleToUserIds: deal.visibleToUserIds,
        })
        .returning({ id: leads.id });
      if (lead === undefined) {
        throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "convertDealToLead: lead insert no rows");
      }

      await syncEntityLabelNames(tx, "lead", lead.id, deal.labels, signal);

      const now = new Date();
      const [closed] = await tx
        .update(deals)
        .set({ archivedAt: now, updatedAt: now })
        .where(
          and(
            eq(deals.id, deal.id),
            isNull(deals.archivedAt),
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
          field: CHANGE_FIELD_CONVERTED_TO_LEAD,
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
          field: CHANGE_FIELD_CREATED_FROM_DEAL,
          oldValue: null,
          newValue: deal.id,
          actorId: actor.id,
        },
        signal,
      );

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
