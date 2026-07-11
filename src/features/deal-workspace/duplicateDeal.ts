// duplicateDeal: clone a visible deal into a NEW open deal in the same pipeline/stage, owned by the
// actor, with fresh timestamps. Won/lost/archived/deleted state is intentionally NOT copied (a
// duplicate is a fresh opportunity). Gated on deal.create (like createDeal) + source visibility.
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { BOARD_EVENT, dealMovedChannel } from "@/constants/boardChannels";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { deals } from "@/db/schema/deals";
import { users } from "@/db/schema/identity";
import { pipelines } from "@/db/schema/pipelines";
import { settings } from "@/db/schema/system";
import { recordChange } from "@/features/collaboration/changeLog";
import { midpoint } from "@/features/deals/boardPosition";
import { toVisibleDeal } from "@/features/deals/dealAuth";
import { canSee } from "@/features/permissions/canSee";
import type { PermSetUser } from "@/features/permissions/effective";
import { resolveVisibilityGroup } from "@/features/permissions/entityCreate";
import { publishBoardEvent } from "@/server/realtime/events";
import { err, ok, type Result } from "@/types/result";

export const duplicateDealInput = z.object({ dealId: z.string().uuid() });
export type DuplicateDealInput = z.infer<typeof duplicateDealInput>;

// Suffix appended to the cloned title (Pipedrive parity: "Deal (copy)").
const COPY_SUFFIX = " (copy)";

export async function duplicateDeal(
  db: Db,
  actor: PermSetUser,
  raw: unknown,
  signal: AbortSignal,
): Promise<Result<{ id: string; updatedAt: Date }, AppError>> {
  const input = duplicateDealInput.parse(raw);
  signal.throwIfAborted();

  // Load the source (soft-deleted deals are invisible; 404 like any missing row).
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

  // Source must be visible to the actor (404-on-invisible: do not leak existence).
  if (!canSee(actor, toVisibleDeal(source, pipelineVisibilityGroupId))) {
    return err(
      new AppError(ERROR_IDS.DEAL_NOT_FOUND, "Deal not found or not visible", {
        dealId: input.dealId,
      }),
    );
  }

  // Creating the clone requires the global deal.create capability (admin bypasses).
  if (actor.type !== "admin" && !actor.flags.has("deal.create")) {
    return err(
      new AppError(ERROR_IDS.PERM_DENIED, "deal.create capability required", { userId: actor.id }),
    );
  }
  signal.throwIfAborted();

  // Visibility derived server-side from the deal default (never inherited from the source, which
  // may be more permissive than the actor's default allows them to grant).
  const [cfg] = await db.select().from(settings).where(eq(settings.id, true));
  const level = (cfg?.defaultVisibilityLevels.deal ?? "owner") as "owner" | "group" | "all";
  let visibilityGroupId: string | null = null;
  if (level === "group") {
    // Resolve the actor's own primary group (like normal deal creation). PermSetUser does not carry
    // it, so load it from the users row; a hardcoded null here made group-default duplication fail
    // with E_PERM_003 even for users whose primary group is set.
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
        // Always a fresh open deal: won/lost/archived/deleted state is NOT carried over.
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

    await recordChange(
      tx,
      {
        entityType: "deal",
        entityId: clone.id,
        field: "duplicatedFromDealId",
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
