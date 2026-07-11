// Lead visibility clause. Leads have no pipeline, so the pipeline gate is a no-op (NULL); the
// remaining owner / all / group / allowlist rules are identical to deals, reusing the proven
// predicate. Queries select FROM leads without an alias, so columns use the real table name.
import { type SQL, sql } from "drizzle-orm";
import { dealVisibilityPredicate } from "@/features/permissions/sql";
import type { DealVisibilitySession } from "@/types/session";

const LEAD_COLS = {
  ownerId: sql`leads.owner_id`,
  visibilityLevel: sql`leads.visibility_level`,
  visibilityGroupId: sql`leads.visibility_group_id`,
  visibleToUserIds: sql`leads.visible_to_user_ids`,
  // No pipeline to gate on: NULL makes the pipeline gate always pass.
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
