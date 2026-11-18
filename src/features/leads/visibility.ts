import { type SQL, sql } from "drizzle-orm";
import { dealVisibilityPredicate } from "@/features/permissions/sql";
import type { DealVisibilitySession } from "@/types/session";

const LEAD_COLS = {
  ownerId: sql`leads.owner_id`,
  visibilityLevel: sql`leads.visibility_level`,
  visibilityGroupId: sql`leads.visibility_group_id`,
  visibleToUserIds: sql`leads.visible_to_user_ids`,
  pipelineVisibilityGroupId: sql`NULL`,
} as const;

export function leadVisibilityClause(session: DealVisibilitySession): SQL {
  return dealVisibilityPredicate(
    {
      userId: session.userId,
      isAdmin: session.isAdmin,
      isActive: session.isActive,
      sessionLive: session.sessionLive,
      groupIds: session.visibilityGroupIds,
      managedUserIds: session.managedUserIds ?? [],
    },
    LEAD_COLS,
  );
}
