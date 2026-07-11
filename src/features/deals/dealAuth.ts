// Shared deal authorization: the single source of truth for "can this session edit
// this deal". Both moveDeal and updateDeal MUST go through loadEditableDeal so the
// visibility/authorization model can never silently diverge between the two actions.
import { and, eq, isNull } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { deals } from "@/db/schema/deals";
import { pipelines } from "@/db/schema/pipelines";
import { can } from "@/features/permissions/can";
import { canSee } from "@/features/permissions/canSee";
import type { PermSetUser } from "@/features/permissions/effective";
import type { VisibleDeal } from "@/features/permissions/types";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import { err, ok, type Result } from "@/types/result";

// The subset of deal columns toVisibleDeal reads. Narrowed (not the full row) so a
// projected query (e.g. the bulk list) can build a VisibleDeal without selecting every
// column. A full deals.$inferSelect row still satisfies this Pick.
type VisibleDealFields = Pick<
  typeof deals.$inferSelect,
  "ownerId" | "visibilityLevel" | "visibilityGroupId" | "visibleToUserIds"
>;

// Build the VisibleDeal shape can() needs from a loaded deal + its pipeline.
// Pipeline restriction lives on pipelines, not deals (data-model), so callers
// must supply pipelineVisibilityGroupId.
export function toVisibleDeal(
  deal: VisibleDealFields,
  pipelineVisibilityGroupId: string | null,
): VisibleDeal {
  return {
    kind: "deal",
    ownerId: deal.ownerId,
    visibilityLevel: deal.visibilityLevel,
    visibilityGroupId: deal.visibilityGroupId ?? null,
    visibleToUserIds: deal.visibleToUserIds,
    pipelineVisibilityGroupId,
  };
}

export interface EditableDeal {
  deal: typeof deals.$inferSelect;
  pipelineVisibilityGroupId: string | null;
}

// Load a deal and enforce can(session,'deal.edit'). Order matters (fail closed):
// canSee first so an invisible deal is 404-on-invisible (E_DEAL_001), then the
// edit flag so a visible-but-unowned deal is PERM_DENIED. Returns the loaded row
// and its pipeline visibility group so callers can reuse both without re-querying.
export async function loadEditableDeal(
  db: DbOrTx,
  session: PermSetUser,
  dealId: string,
  signal: AbortSignal,
): Promise<Result<EditableDeal, AppError>> {
  // A soft-deleted deal is hidden from every read path, so it must not be editable via a
  // stale id either (F16): filter deletedAt in the load so it 404s like any invisible deal.
  const [deal] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, dealId), isNull(deals.deletedAt)));
  if (deal === undefined) {
    return err(new AppError(ERROR_IDS.DEAL_NOT_FOUND, "Deal not found", { dealId }));
  }
  signal.throwIfAborted();

  const [pipeline] = await db
    .select({
      visibilityGroupId: pipelines.visibilityGroupId,
      isArchived: pipelines.isArchived,
    })
    .from(pipelines)
    .where(eq(pipelines.id, deal.pipelineId));
  // An archived pipeline hides all its deals from reads (F7/F9); a stale id must not be a
  // mutation backdoor either (F16). A missing pipeline row also fails closed as not-found.
  if (pipeline === undefined || pipeline.isArchived) {
    return err(new AppError(ERROR_IDS.DEAL_NOT_FOUND, "Deal not found", { dealId }));
  }
  const pipelineVisibilityGroupId = pipeline.visibilityGroupId ?? null;

  const visibleRecord = toVisibleDeal(deal, pipelineVisibilityGroupId);
  if (!can(session, "deal.edit", visibleRecord)) {
    if (!canSee(session, visibleRecord)) {
      return err(
        new AppError(ERROR_IDS.DEAL_NOT_FOUND, "Deal not found or not visible", { dealId }),
      );
    }
    return err(
      new AppError(ERROR_IDS.PERM_DENIED, "Not permitted to edit this deal", {
        userId: session.id,
        dealId,
      }),
    );
  }
  signal.throwIfAborted();

  return ok({ deal, pipelineVisibilityGroupId });
}
