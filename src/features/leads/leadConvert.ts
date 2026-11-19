import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { BOARD_EVENT, dealMovedChannel } from "@/constants/boardChannels";
import { CHANGE_FIELD_CONVERTED_DEAL } from "@/constants/changeLogFields";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type * as schema from "@/db/schema";
import { deals } from "@/db/schema/deals";
import { leads } from "@/db/schema/leads";
import { pipelines } from "@/db/schema/pipelines";
import { stages } from "@/db/schema/stages";
import { settings } from "@/db/schema/system";
import { recordChange } from "@/features/collaboration/changeLog";
import { listDefs } from "@/features/custom-fields/defsRepo";
import { midpoint } from "@/features/deals/boardPosition";
import { validateDealCustomFieldsForCreate } from "@/features/deals/dealCustomFieldsValidation";
import { enqueueDealSearchRefresh } from "@/features/intercom/dealSearch/enqueue";
import { syncEntityLabelNames } from "@/features/labels/labelsRepo.entities";
import { resolveVisibilityGroup } from "@/features/permissions/entityCreate";
import { publishBoardEvent } from "@/server/realtime/events";
import type { EntityType } from "@/types/entityRef";
import { err, ok, type Result } from "@/types/result";
import { carryLeadHistoryToDeal } from "./convertCarryOver";
import { carryCustomFields, overlayCustomFields } from "./convertCustomFields";
import { resolveConvertReferences } from "./convertReferences";
import type { LeadSession } from "./leadActions";
import { type ConvertLeadInput, convertLeadInput } from "./schemas";
import { leadVisibilityClause } from "./visibility";

type Db = NodePgDatabase<typeof schema>;

const LEAD_ENTITY: EntityType = "lead";

class ConvertConflict extends Error {}

async function resolveTargetStage(
  db: Db,
  input: ConvertLeadInput,
  defaultPipelineId: string | null,
  signal: AbortSignal,
): Promise<Result<{ pipelineId: string; stageId: string }, AppError>> {
  let pipelineId: string | null = null;

  if (input.pipelineId !== undefined) {
    const [pipe] = await db
      .select({ id: pipelines.id, isArchived: pipelines.isArchived })
      .from(pipelines)
      .where(eq(pipelines.id, input.pipelineId));
    signal.throwIfAborted();
    if (pipe === undefined || pipe.isArchived) {
      return err(
        new AppError(ERROR_IDS.LEAD_CONVERT_NO_PIPELINE, "Requested pipeline missing or archived", {
          pipelineId: input.pipelineId,
        }),
      );
    }
    pipelineId = pipe.id;
  } else if (defaultPipelineId !== null) {
    const [pipe] = await db
      .select({ id: pipelines.id })
      .from(pipelines)
      .where(and(eq(pipelines.id, defaultPipelineId), eq(pipelines.isArchived, false)));
    signal.throwIfAborted();
    pipelineId = pipe?.id ?? null;
  }

  if (pipelineId === null) {
    const [first] = await db
      .select({ id: pipelines.id })
      .from(pipelines)
      .where(eq(pipelines.isArchived, false))
      .orderBy(asc(pipelines.order))
      .limit(1);
    signal.throwIfAborted();
    pipelineId = first?.id ?? null;
  }
  if (pipelineId === null) {
    return err(new AppError(ERROR_IDS.LEAD_CONVERT_NO_PIPELINE, "No target pipeline for convert"));
  }
  const [firstStage] = await db
    .select({ id: stages.id })
    .from(stages)
    .where(eq(stages.pipelineId, pipelineId))
    .orderBy(asc(stages.order))
    .limit(1);
  signal.throwIfAborted();
  if (firstStage === undefined) {
    return err(
      new AppError(ERROR_IDS.LEAD_CONVERT_NO_PIPELINE, "Target pipeline has no stages", {
        pipelineId,
      }),
    );
  }
  return ok({ pipelineId, stageId: firstStage.id });
}

export async function convertLead(
  db: Db,
  session: LeadSession,
  raw: ConvertLeadInput,
  signal: AbortSignal,
): Promise<Result<{ dealId: string }, AppError>> {
  const input = convertLeadInput.parse(raw);
  signal.throwIfAborted();

  if (session.isAdmin !== true && session.flags["deal.create"] !== true) {
    return err(
      new AppError(ERROR_IDS.PERM_DENIED, "deal.create capability required", {
        userId: session.userId,
      }),
    );
  }

  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, input.leadId), isNull(leads.deletedAt), leadVisibilityClause(session)));
  signal.throwIfAborted();
  if (lead === undefined) {
    return err(
      new AppError(ERROR_IDS.LEAD_NOT_FOUND, "Lead not found or not visible", {
        leadId: input.leadId,
      }),
    );
  }
  if (lead.convertedDealId !== null) {
    return err(
      new AppError(ERROR_IDS.LEAD_ALREADY_CONVERTED, "Lead already converted", {
        leadId: lead.id,
        dealId: lead.convertedDealId,
      }),
    );
  }

  const [cfg] = await db.select().from(settings).where(eq(settings.id, true));
  const target = await resolveTargetStage(db, input, cfg?.defaultPipelineId ?? null, signal);
  if (!target.ok) return target;
  const { pipelineId, stageId } = target.value;

  const refs = await resolveConvertReferences(db, session, lead, signal);
  if (!refs.ok) return refs;

  const [leadDefs, dealDefs] = await Promise.all([
    listDefs(db, "lead", {}, signal),
    listDefs(db, "deal", {}, signal),
  ]);
  const carried = carryCustomFields(
    leadDefs,
    dealDefs,
    lead.customFields as Record<string, unknown>,
  );
  const customFields = await validateDealCustomFieldsForCreate(
    db,
    overlayCustomFields(carried, input.customFields),
    signal,
  );
  if (!customFields.ok) return customFields;

  const level = (cfg?.defaultVisibilityLevels.deal ?? "owner") as "owner" | "group" | "all";
  let visibilityGroupId: string | null = null;
  if (level === "group") {
    const group = resolveVisibilityGroup(session, undefined);
    if (!group.ok) return group;
    visibilityGroupId = group.value;
  }
  signal.throwIfAborted();

  try {
    return await db.transaction(async (tx) => {
      const [bottom] = await tx
        .select({ pos: deals.boardPosition })
        .from(deals)
        .where(and(eq(deals.stageId, stageId), isNull(deals.deletedAt)))
        .orderBy(desc(deals.boardPosition))
        .limit(1);
      const position = midpoint(bottom?.pos ?? null, null);

      const [deal] = await tx
        .insert(deals)
        .values({
          title: lead.title,
          status: "open",
          value: lead.value,
          expectedCloseDate: lead.expectedCloseDate,
          labels: lead.labels,
          sourceChannel: lead.sourceChannel,
          sourceChannelId: lead.sourceChannelId,
          pipelineId,
          stageId,
          boardPosition: position,
          personId: refs.value.personId,
          orgId: refs.value.orgId,
          customFields: customFields.value,
          ownerId: lead.ownerId,
          visibilityLevel: level,
          visibilityGroupId,
        })
        .returning({ id: deals.id, stageId: deals.stageId, boardPosition: deals.boardPosition });
      if (deal === undefined) {
        throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "convertLead: deal insert returned no rows");
      }

      await syncEntityLabelNames(tx, "deal", deal.id, lead.labels, signal);
      if (refs.value.personId !== null) await enqueueDealSearchRefresh(tx, [deal.id], signal);

      await carryLeadHistoryToDeal(tx, { leadId: lead.id, dealId: deal.id, signal });

      const [updated] = await tx
        .update(leads)
        .set({ convertedDealId: deal.id, archivedAt: sql`now()`, updatedAt: new Date() })
        .where(
          and(
            eq(leads.id, lead.id),
            isNull(leads.convertedDealId),
            sql`date_trunc('milliseconds', ${leads.updatedAt}) = ${new Date(input.expectedUpdatedAt)}`,
          ),
        )
        .returning({ id: leads.id });
      if (updated === undefined) throw new ConvertConflict();

      await recordChange(
        tx,
        {
          entityType: LEAD_ENTITY,
          entityId: lead.id,
          field: CHANGE_FIELD_CONVERTED_DEAL,
          oldValue: null,
          newValue: deal.id,
          actorId: session.userId,
        },
        signal,
      );

      await publishBoardEvent(
        tx,
        {
          channel: dealMovedChannel(pipelineId),
          type: BOARD_EVENT.dealCreated,
          actorId: session.userId,
          data: { dealId: deal.id, toStageId: deal.stageId, boardPosition: deal.boardPosition },
        },
        signal,
      );

      return ok({ dealId: deal.id });
    });
  } catch (e) {
    if (e instanceof ConvertConflict) {
      return err(
        new AppError(ERROR_IDS.LEAD_NOT_FOUND, "Lead changed before convert (stale)", {
          leadId: lead.id,
        }),
      );
    }
    throw e;
  }
}
