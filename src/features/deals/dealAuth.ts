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

type VisibleDealFields = Pick<
  typeof deals.$inferSelect,
  "ownerId" | "visibilityLevel" | "visibilityGroupId" | "visibleToUserIds"
>;

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

export async function loadEditableDeal(
  db: DbOrTx,
  session: PermSetUser,
  dealId: string,
  signal: AbortSignal,
): Promise<Result<EditableDeal, AppError>> {
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
