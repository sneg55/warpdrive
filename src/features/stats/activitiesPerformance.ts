// Activities performance query: completed vs scheduled counts for the dashboard.
// Visibility-scoped through the linked deal (deal-dominates rule): activities
// whose dealId links to an invisible deal are excluded via a correlated sub-select
// that uses dealVisibilityPredicate with aliases d2/p2.
import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { PermSetUser } from "@/features/permissions/effective";
import { dealVisibilityPredicate, type VisibilityCtx } from "@/features/permissions/sql";
import type { ActivityPerformance, DashboardFilters } from "@/types/stats";

// DealCols using the d2/p2 sub-select aliases (deal-dominates visibility check).
const DEAL_COLS_D2 = {
  ownerId: sql`d2.owner_id`,
  visibilityLevel: sql`d2.visibility_level`,
  visibilityGroupId: sql`d2.visibility_group_id`,
  visibleToUserIds: sql`d2.visible_to_user_ids`,
  pipelineVisibilityGroupId: sql`p2.visibility_group_id`,
} as const;

function toCtx(actor: PermSetUser): VisibilityCtx {
  return {
    userId: actor.id,
    isAdmin: actor.type === "admin",
    isActive: actor.isActive,
    sessionLive: true,
    groupIds: Array.from(actor.groupIds),
    managedUserIds: Array.from(actor.managedUserIds ?? []),
  };
}

export async function activitiesPerformance(
  db: Db,
  actor: PermSetUser,
  filters: DashboardFilters,
  signal: AbortSignal,
): Promise<ActivityPerformance> {
  signal.throwIfAborted();

  const subVisPred = dealVisibilityPredicate(toCtx(actor), DEAL_COLS_D2);
  const ownerClause =
    filters.ownerScope === "me" ? sql`AND a.assignee_id = ${actor.id}::uuid` : sql``;
  const pipelineClause =
    filters.pipelineId !== null
      ? sql`AND EXISTS (
          SELECT 1 FROM deals d3 WHERE d3.id = a.deal_id AND d3.pipeline_id = ${filters.pipelineId}
        )`
      : sql``;

  const result = await db.execute(sql`
    SELECT
      count(*) filter (where a.done = true)::int  AS completed,
      count(*)::int                                AS scheduled
    FROM activities a
    WHERE a.deleted_at IS NULL
      AND a.due_at >= ${filters.from}::date
      AND a.due_at <  ${filters.to}::date + INTERVAL '1 day'
      AND (
        a.deal_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM deals d2
          JOIN pipelines p2 ON p2.id = d2.pipeline_id
          WHERE d2.id = a.deal_id
            AND p2.is_archived = false
            AND ${subVisPred}
        )
      )
      ${ownerClause}
      ${pipelineClause}
  `);

  signal.throwIfAborted();

  const rows = (result as unknown as { rows: Array<{ completed: number; scheduled: number }> })
    .rows;
  const row = rows[0];
  return { completed: row?.completed ?? 0, scheduled: row?.scheduled ?? 0 };
}
