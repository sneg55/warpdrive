import { and, desc, eq, sql } from "drizzle-orm";

export { moveDeal } from "./dealMove";
export { updateDeal } from "./dealUpdate";

import { BOARD_EVENT, dealMovedChannel } from "@/constants/boardChannels";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { deals } from "@/db/schema/deals";
import { pipelines } from "@/db/schema/pipelines";
import { stages } from "@/db/schema/stages";
import { settings } from "@/db/schema/system";
import { syncEntityLabelNames } from "@/features/labels/labelsRepo.entities";
import {
  type EntityCreateSession,
  resolveOwnerId,
  resolveVisibilityGroup,
} from "@/features/permissions/entityCreate";
import { assertReferenceVisible } from "@/features/permissions/referenceCheck";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import { publishBoardEvent } from "@/server/realtime/events";
import { err, ok, type Result } from "@/types/result";
import { midpoint } from "./boardPosition";
import { validateDealCustomFieldsForCreate } from "./dealCustomFieldsValidation";
import { dealCreateInput } from "./schemas";

export type CreateDealSession = EntityCreateSession;

export async function createDeal(
  db: DbOrTx,
  session: CreateDealSession,
  raw: unknown,
  signal: AbortSignal,
): Promise<Result<typeof deals.$inferSelect, AppError>> {
  const input = dealCreateInput.parse(raw);
  signal.throwIfAborted();

  if (session.isAdmin !== true && session.flags["deal.create"] !== true) {
    return err(
      new AppError(ERROR_IDS.PERM_DENIED, "deal.create capability required", {
        userId: session.userId,
      }),
    );
  }

  const customFieldsResult = await validateDealCustomFieldsForCreate(
    db,
    input.customFields ?? {},
    signal,
  );
  if (customFieldsResult.ok === false) return customFieldsResult;

  const [pipe] = await db
    .select({ visibilityGroupId: pipelines.visibilityGroupId, isArchived: pipelines.isArchived })
    .from(pipelines)
    .where(eq(pipelines.id, input.pipelineId));
  if (pipe === undefined) {
    return err(
      new AppError(ERROR_IDS.DEAL_STAGE_MISMATCH, "Pipeline does not exist", {
        pipelineId: input.pipelineId,
      }),
    );
  }
  if (pipe.isArchived) {
    return err(
      new AppError(ERROR_IDS.DEAL_STAGE_MISMATCH, "Pipeline is archived", {
        pipelineId: input.pipelineId,
      }),
    );
  }
  if (
    session.isAdmin !== true &&
    pipe.visibilityGroupId !== null &&
    !session.visibilityGroupIds.includes(pipe.visibilityGroupId)
  ) {
    return err(
      new AppError(ERROR_IDS.PERM_DENIED, "restricted pipeline not visible to actor", {
        userId: session.userId,
        pipelineId: input.pipelineId,
      }),
    );
  }
  signal.throwIfAborted();

  const [stage] = await db
    .select({ id: stages.id })
    .from(stages)
    .where(and(eq(stages.id, input.stageId), eq(stages.pipelineId, input.pipelineId)));
  if (stage === undefined) {
    return err(
      new AppError(ERROR_IDS.DEAL_STAGE_MISMATCH, "Stage does not belong to the pipeline", {
        stageId: input.stageId,
        pipelineId: input.pipelineId,
      }),
    );
  }
  signal.throwIfAborted();

  const ownerResult = await resolveOwnerId(db, session, input.ownerId, signal);
  if (!ownerResult.ok) return ownerResult;
  const ownerId = ownerResult.value;
  signal.throwIfAborted();

  const [cfg] = await db.select().from(settings).where(eq(settings.id, true));
  const levels = cfg?.defaultVisibilityLevels;
  const level = (levels?.deal ?? "owner") as "owner" | "group" | "all";

  let visibilityGroupId: string | null = null;
  if (level === "group") {
    const group = resolveVisibilityGroup(session, input.visibilityGroupId);
    if (!group.ok) return group;
    visibilityGroupId = group.value;
  }
  signal.throwIfAborted();

  return db.transaction(async (tx) => {
    if (input.personId !== null) {
      const ref = await assertReferenceVisible(
        tx,
        session,
        { kind: "person", id: input.personId },
        signal,
      );
      if (ref.ok === false) {
        return err(
          new AppError(ERROR_IDS.DEAL_NOT_FOUND, "Referenced person not found or not visible", {
            personId: input.personId,
          }),
        );
      }
    }
    if (input.orgId !== null) {
      const ref = await assertReferenceVisible(
        tx,
        session,
        { kind: "organization", id: input.orgId },
        signal,
      );
      if (ref.ok === false) {
        return err(
          new AppError(
            ERROR_IDS.DEAL_NOT_FOUND,
            "Referenced organization not found or not visible",
            {
              orgId: input.orgId,
            },
          ),
        );
      }
    }

    const [bottom] = await tx
      .select({ pos: deals.boardPosition })
      .from(deals)
      .where(and(eq(deals.stageId, input.stageId), sql`deleted_at is null`))
      .orderBy(desc(deals.boardPosition))
      .limit(1);
    const position = midpoint(bottom?.pos ?? null, null);
    signal.throwIfAborted();

    const [row] = await tx
      .insert(deals)
      .values({
        title: input.title,
        status: "open",
        value: input.value === null ? null : input.value.toFixed(2),
        expectedCloseDate: input.expectedCloseDate,
        labels: input.labels,
        sourceChannel: input.sourceChannel,
        sourceChannelId: input.sourceChannelId,
        pipelineId: input.pipelineId,
        stageId: input.stageId,
        boardPosition: position,
        personId: input.personId,
        orgId: input.orgId,
        ownerId,
        visibilityLevel: level,
        visibilityGroupId,
        customFields: customFieldsResult.value,
      })
      .returning();

    if (row === undefined) {
      throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "createDeal: insert returned no rows");
    }

    await syncEntityLabelNames(tx, "deal", row.id, row.labels, signal);

    await publishBoardEvent(
      tx,
      {
        channel: dealMovedChannel(input.pipelineId),
        type: BOARD_EVENT.dealCreated,
        actorId: session.userId,
        data: {
          dealId: row.id,
          toStageId: row.stageId,
          boardPosition: row.boardPosition,
        },
      },
      signal,
    );

    return ok(row);
  });
}
