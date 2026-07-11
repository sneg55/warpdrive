import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { BOARD_EVENT, dealMovedChannel } from "@/constants/boardChannels";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type * as schema from "@/db/schema";
import { deals } from "@/db/schema/deals";
import { leads } from "@/db/schema/leads";
import { pipelines } from "@/db/schema/pipelines";
import { stages } from "@/db/schema/stages";
import { settings } from "@/db/schema/system";
import { recordChange } from "@/features/collaboration/changeLog";
import { midpoint } from "@/features/deals/boardPosition";
import { resolveVisibilityGroup } from "@/features/permissions/entityCreate";
import { assertReferenceVisible } from "@/features/permissions/referenceCheck";
import { publishBoardEvent } from "@/server/realtime/events";
import type { EntityType } from "@/types/entityRef";
import { err, ok, type Result } from "@/types/result";
import type { LeadSession } from "./leadActions";
import { type ConvertLeadInput, convertLeadInput } from "./schemas";
import { leadVisibilityClause } from "./visibility";

type Db = NodePgDatabase<typeof schema>;

// change_logs.entity_type is a free-text column; "lead" is a valid parent and (since Task 14
// widened ENTITY_TYPES to include it) a real EntityType member, no local cast needed.
const LEAD_ENTITY: EntityType = "lead";

// Thrown inside the transaction to roll back the deal insert when the lead's CAS lock loses (a
// concurrent write moved updated_at, or the lead was converted between the pre-check and here).
class ConvertConflict extends Error {}

type LeadRow = typeof leads.$inferSelect;

// Resolve the target pipeline (explicit, else org default) and its first stage (lowest order).
async function resolveTargetStage(
  db: Db,
  input: ConvertLeadInput,
  defaultPipelineId: string | null,
  signal: AbortSignal,
): Promise<Result<{ pipelineId: string; stageId: string }, AppError>> {
  const pipelineId = input.pipelineId ?? defaultPipelineId ?? null;
  if (pipelineId === null) {
    return err(new AppError(ERROR_IDS.LEAD_CONVERT_NO_PIPELINE, "No target pipeline for convert"));
  }
  const [pipe] = await db
    .select({ id: pipelines.id, isArchived: pipelines.isArchived })
    .from(pipelines)
    .where(eq(pipelines.id, pipelineId));
  if (pipe === undefined || pipe.isArchived) {
    return err(
      new AppError(ERROR_IDS.LEAD_CONVERT_NO_PIPELINE, "Target pipeline missing or archived", {
        pipelineId,
      }),
    );
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

// Re-check the lead's person/org references exactly like createLead: a hidden reference must not
// become a deal the actor could probe.
async function assertConvertReferences(
  db: Db,
  session: LeadSession,
  lead: LeadRow,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  if (lead.personId !== null) {
    const ref = await assertReferenceVisible(
      db,
      session,
      { kind: "person", id: lead.personId },
      signal,
    );
    if (!ref.ok) return ref;
  }
  if (lead.orgId !== null) {
    const ref = await assertReferenceVisible(
      db,
      session,
      { kind: "organization", id: lead.orgId },
      signal,
    );
    if (!ref.ok) return ref;
  }
  return ok(undefined);
}

// convertLead: turn a visible lead into a deal in the target pipeline's FIRST stage, then archive
// the lead and stamp converted_deal_id, atomically. Visibility of the created deal is derived
// server-side (settings default), never from the client. CAS-locked on the lead's updatedAt.
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

  // Load the lead under the visibility gate (404-on-invisible).
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

  // Resolve target pipeline (explicit, else org default) and its first stage (lowest order).
  const [cfg] = await db.select().from(settings).where(eq(settings.id, true));
  const target = await resolveTargetStage(db, input, cfg?.defaultPipelineId ?? null, signal);
  if (!target.ok) return target;
  const { pipelineId, stageId } = target.value;

  const refs = await assertConvertReferences(db, session, lead, signal);
  if (!refs.ok) return refs;

  // Visibility derived server-side (same policy as createLead).
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
          personId: lead.personId,
          orgId: lead.orgId,
          // Owner preserved from the lead; visibility derived above.
          ownerId: lead.ownerId,
          visibilityLevel: level,
          visibilityGroupId,
        })
        .returning({ id: deals.id, stageId: deals.stageId, boardPosition: deals.boardPosition });
      if (deal === undefined) {
        throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "convertLead: deal insert returned no rows");
      }

      // CAS-lock the lead on its updatedAt (and still-unconverted) before stamping the result.
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
          field: "convertedDealId",
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
