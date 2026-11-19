import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { BOARD_EVENT, dealMovedChannel } from "@/constants/boardChannels";
import { CHANGE_FIELD_DUPLICATED_FROM_DEAL } from "@/constants/changeLogFields";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { deals } from "@/db/schema/deals";
import { users } from "@/db/schema/identity";
import { pipelines } from "@/db/schema/pipelines";
import { settings } from "@/db/schema/system";
import { recordChange } from "@/features/collaboration/changeLog";
import { midpoint } from "@/features/deals/boardPosition";
import { toVisibleDeal } from "@/features/deals/dealAuth";
import { validateDealCustomFieldsForCreate } from "@/features/deals/dealCustomFieldsValidation";
import { enqueueDealSearchRefresh } from "@/features/intercom/dealSearch/enqueue";
import { canSee } from "@/features/permissions/canSee";
import type { PermSetUser } from "@/features/permissions/effective";
import { resolveVisibilityGroup } from "@/features/permissions/entityCreate";
import { publishBoardEvent } from "@/server/realtime/events";
import { err, ok, type Result } from "@/types/result";

export const duplicateDealInput = z.object({ dealId: z.string().uuid() });

const COPY_SUFFIX = " (copy)";

export async function duplicateDeal(
  db: Db,
  actor: PermSetUser,
  raw: unknown,
  signal: AbortSignal,
): Promise<Result<{ id: string; updatedAt: Date }, AppError>> {
  const input = duplicateDealInput.parse(raw);
  signal.throwIfAborted();

  const [source] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, input.dealId), isNull(deals.deletedAt)));
  if (source === undefined) {
    return err(new AppError(ERROR_IDS.DEAL_NOT_FOUND, "Deal not found", { dealId: input.dealId }));
  }
  signal.throwIfAborted();

  const [pipe] = await db
    .select({ visibilityGroupId: pipelines.visibilityGroupId, isArchived: pipelines.isArchived })
    .from(pipelines)
    .where(eq(pipelines.id, source.pipelineId));
  if (pipe === undefined || pipe.isArchived) {
    return err(new AppError(ERROR_IDS.DEAL_NOT_FOUND, "Deal not found", { dealId: input.dealId }));
  }
  const pipelineVisibilityGroupId = pipe.visibilityGroupId ?? null;

  if (!canSee(actor, toVisibleDeal(source, pipelineVisibilityGroupId))) {
    return err(
      new AppError(ERROR_IDS.DEAL_NOT_FOUND, "Deal not found or not visible", {
        dealId: input.dealId,
      }),
    );
  }

  if (actor.type !== "admin" && !actor.flags.has("deal.create")) {
    return err(
      new AppError(ERROR_IDS.PERM_DENIED, "deal.create capability required", { userId: actor.id }),
    );
  }
  signal.throwIfAborted();

  const customFields = await validateDealCustomFieldsForCreate(
    db,
    source.customFields as Record<string, unknown>,
    signal,
  );
  if (!customFields.ok) return customFields;

  const [cfg] = await db.select().from(settings).where(eq(settings.id, true));
  const level = (cfg?.defaultVisibilityLevels.deal ?? "owner") as "owner" | "group" | "all";
  let visibilityGroupId: string | null = null;
  if (level === "group") {
    const [u] = await db
      .select({ primary: users.primaryVisibilityGroupId })
      .from(users)
      .where(eq(users.id, actor.id));
    const group = resolveVisibilityGroup(
      {
        userId: actor.id,
        isAdmin: actor.type === "admin",
        isActive: actor.isActive,
        sessionLive: true,
        visibilityGroupIds: Array.from(actor.groupIds),
        managedUserIds: Array.from(actor.managedUserIds ?? []),
        primaryVisibilityGroupId: u?.primary ?? null,
        flags: {},
      },
      undefined,
    );
    if (!group.ok) return group;
    visibilityGroupId = group.value;
  }
  signal.throwIfAborted();

  return db.transaction(async (tx) => {
    const [bottom] = await tx
      .select({ pos: deals.boardPosition })
      .from(deals)
      .where(and(eq(deals.stageId, source.stageId), isNull(deals.deletedAt)))
      .orderBy(desc(deals.boardPosition))
      .limit(1);
    const position = midpoint(bottom?.pos ?? null, null);

    const [clone] = await tx
      .insert(deals)
      .values({
        title: source.title + COPY_SUFFIX,
        status: "open",
        value: source.value,
        expectedCloseDate: source.expectedCloseDate,
        labels: source.labels,
        sourceChannel: source.sourceChannel,
        sourceChannelId: source.sourceChannelId,
        pipelineId: source.pipelineId,
        stageId: source.stageId,
        boardPosition: position,
        personId: source.personId,
        orgId: source.orgId,
        customFields: source.customFields,
        ownerId: actor.id,
        visibilityLevel: level,
        visibilityGroupId,
      })
      .returning({
        id: deals.id,
        stageId: deals.stageId,
        boardPosition: deals.boardPosition,
        updatedAt: deals.updatedAt,
      });
    if (clone === undefined) {
      throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "duplicateDeal: insert returned no rows");
    }

    await enqueueDealSearchRefresh(tx, [clone.id], signal);
    await recordChange(
      tx,
      {
        entityType: "deal",
        entityId: clone.id,
        field: CHANGE_FIELD_DUPLICATED_FROM_DEAL,
        oldValue: null,
        newValue: source.id,
        actorId: actor.id,
      },
      signal,
    );

    await publishBoardEvent(
      tx,
      {
        channel: dealMovedChannel(source.pipelineId),
        type: BOARD_EVENT.dealCreated,
        actorId: actor.id,
        data: { dealId: clone.id, toStageId: clone.stageId, boardPosition: clone.boardPosition },
      },
      signal,
    );

    return ok({ id: clone.id, updatedAt: clone.updatedAt });
  });
}
