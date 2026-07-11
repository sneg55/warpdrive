// followDeal / unfollowDeal: self-only follow toggle for the deal header.
// Following requires only VISIBILITY (canSee), not edit: a user who can see a deal may
// follow it to receive updates. We therefore build the VisibleDeal via toVisibleDeal +
// canSee (like getWorkspace/summaryRepo) rather than loadEditableDeal, which would wrongly
// reject a visible-but-unowned deal. Both operations are idempotent.
import { and, eq, isNull } from "drizzle-orm";
import { CHANGE_FIELD_FOLLOWER } from "@/constants/changeLogFields";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { dealFollowers, deals, pipelines } from "@/db/schema";
import { recordChange } from "@/features/collaboration/changeLog";
import { toVisibleDeal } from "@/features/deals/dealAuth";
import { canSee } from "@/features/permissions/canSee";
import type { PermSetUser } from "@/features/permissions/effective";
import { err, ok, type Result } from "@/types/result";

// Load the deal + its pipeline visibility group and confirm the actor can SEE it. Returns
// DEAL_NOT_FOUND (404-on-invisible) for a missing, soft-deleted, archived-pipeline, or
// invisible deal so a follow attempt cannot probe for hidden deals.
async function assertVisible(
  db: Db,
  actor: PermSetUser,
  dealId: string,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  const [deal] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, dealId), isNull(deals.deletedAt)));
  if (deal === undefined) {
    return err(new AppError(ERROR_IDS.DEAL_NOT_FOUND, "Deal not found", { dealId }));
  }
  signal.throwIfAborted();

  const [pipe] = await db
    .select({ vg: pipelines.visibilityGroupId, isArchived: pipelines.isArchived })
    .from(pipelines)
    .where(eq(pipelines.id, deal.pipelineId));
  if (pipe === undefined || pipe.isArchived) {
    return err(new AppError(ERROR_IDS.DEAL_NOT_FOUND, "Deal not found", { dealId }));
  }
  if (!canSee(actor, toVisibleDeal(deal, pipe.vg))) {
    return err(new AppError(ERROR_IDS.DEAL_NOT_FOUND, "Deal not found or not visible", { dealId }));
  }
  signal.throwIfAborted();
  return ok(undefined);
}

export async function followDeal(
  db: Db,
  actor: PermSetUser,
  dealId: string,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  const visible = await assertVisible(db, actor, dealId, signal);
  if (visible.ok === false) return visible;

  return db.transaction(async (tx) => {
    // Idempotent: a second follow by the same user is a no-op (composite PK conflict);
    // .returning() lets us log only a real insert. recordChange runs on tx (atomic).
    const inserted = await tx
      .insert(dealFollowers)
      .values({ dealId, userId: actor.id })
      .onConflictDoNothing()
      .returning();
    if (inserted.length > 0) {
      await recordChange(
        tx,
        {
          entityType: "deal",
          entityId: dealId,
          field: CHANGE_FIELD_FOLLOWER,
          oldValue: null,
          newValue: actor.id,
          actorId: actor.id,
        },
        signal,
      );
    }
    signal.throwIfAborted();
    return ok(undefined);
  });
}

export async function unfollowDeal(
  db: Db,
  actor: PermSetUser,
  dealId: string,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  const visible = await assertVisible(db, actor, dealId, signal);
  if (visible.ok === false) return visible;

  return db.transaction(async (tx) => {
    // Idempotent: unfollow-when-absent deletes zero rows and still succeeds; .returning()
    // lets us log only a real delete.
    const deleted = await tx
      .delete(dealFollowers)
      .where(and(eq(dealFollowers.dealId, dealId), eq(dealFollowers.userId, actor.id)))
      .returning();
    if (deleted.length > 0) {
      await recordChange(
        tx,
        {
          entityType: "deal",
          entityId: dealId,
          field: CHANGE_FIELD_FOLLOWER,
          oldValue: actor.id,
          newValue: null,
          actorId: actor.id,
        },
        signal,
      );
    }
    signal.throwIfAborted();
    return ok(undefined);
  });
}
