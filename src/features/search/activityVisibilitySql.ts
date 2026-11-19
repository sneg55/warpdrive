import { type SQL, sql } from "drizzle-orm";
import type { VisibilityCtx } from "@/features/permissions/sql";
import { visibleDealExists, visibleOrgExists, visiblePersonExists } from "./visibilitySql";

export function activityVisibilitySql(ctx: VisibilityCtx): SQL {
  if (!ctx.isActive || !ctx.sessionLive) return sql`FALSE`;
  const parentless = ctx.isAdmin
    ? sql`TRUE`
    : sql`(a.assignee_id = ${ctx.userId} OR EXISTS (
        SELECT 1 FROM activity_participants ap
        WHERE ap.activity_id = a.id AND ap.user_id = ${ctx.userId}
      ))`;
  return sql`(CASE
    WHEN a.deal_id IS NOT NULL THEN ${visibleDealExists(ctx, sql`a.deal_id`)}
    WHEN a.person_id IS NOT NULL THEN ${visiblePersonExists(ctx, sql`a.person_id`)}
    WHEN a.org_id IS NOT NULL THEN ${visibleOrgExists(ctx, sql`a.org_id`)}
    ELSE ${parentless}
  END)`;
}
