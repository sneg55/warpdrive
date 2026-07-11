// Thin adapter: maps a DealVisibilitySession + fixed SQL aliases to the proven
// dealVisibilityPredicate. Any visibility logic change belongs in sql.ts, not here.
// Assumes FROM deals d JOIN pipelines p ON p.id = d.pipeline_id.
import { type SQL, sql } from "drizzle-orm";
import { dealVisibilityPredicate } from "@/features/permissions/sql";
import type { DealVisibilitySession } from "@/types/session";

// Fixed column references using the required table aliases (d = deals, p = pipelines).
const DEAL_COLS = {
  ownerId: sql`d.owner_id`,
  visibilityLevel: sql`d.visibility_level`,
  visibilityGroupId: sql`d.visibility_group_id`,
  visibleToUserIds: sql`d.visible_to_user_ids`,
  pipelineVisibilityGroupId: sql`p.visibility_group_id`,
} as const;

export function dealVisibilityClause(session: DealVisibilitySession): SQL {
  return dealVisibilityPredicate(
    {
      userId: session.userId,
      isAdmin: session.isAdmin,
      isActive: session.isActive,
      sessionLive: session.sessionLive,
      groupIds: session.visibilityGroupIds,
      managedUserIds: session.managedUserIds ?? [],
    },
    DEAL_COLS,
  );
}
