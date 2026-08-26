// Why deals were lost in the range, by count and value.
// Two write paths land a reason: MarkLostDialog sets lost_reason_id, while the deal-update
// API accepts free text in lost_reason. Rows are keyed on the id when there is one and fall
// back to the text, so a typed reason is not silently filed under "no reason".
// Windows on lost_time, and applies dealVisibilityClause.
import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { dealVisibilityClause } from "@/features/deals/visibility";
import type { PermSetUser } from "@/features/permissions/effective";
import type { DashboardFilters, LostReasonCount } from "@/types/stats";

function toSession(actor: PermSetUser) {
  return {
    userId: actor.id,
    isAdmin: actor.type === "admin",
    isActive: actor.isActive,
    sessionLive: true,
    visibilityGroupIds: Array.from(actor.groupIds),
    managedUserIds: Array.from(actor.managedUserIds ?? []),
  };
}

export async function lostReasonBreakdown(
  db: Db,
  actor: PermSetUser,
  filters: DashboardFilters,
  signal: AbortSignal,
): Promise<LostReasonCount[]> {
  signal.throwIfAborted();

  const visClause = dealVisibilityClause(toSession(actor));
  const ownerClause = filters.ownerScope === "me" ? sql`AND d.owner_id = ${actor.id}::uuid` : sql``;
  const pipelineClause =
    filters.pipelineId !== null ? sql`AND d.pipeline_id = ${filters.pipelineId}` : sql``;

  const result = await db.execute(sql`
    SELECT
      d.lost_reason_id AS "reasonId",
      coalesce(lr.name, d.lost_reason) AS "name",
      count(*)::int AS "count",
      coalesce(sum(d.value), 0)::numeric(14,2)::text AS "value"
    FROM deals d
    JOIN pipelines p ON p.id = d.pipeline_id
    LEFT JOIN lost_reasons lr ON lr.id = d.lost_reason_id
    WHERE d.deleted_at IS NULL
      AND d.archived_at IS NULL
      AND p.is_archived = false
      AND d.status = 'lost'
      AND d.lost_time >= ${filters.from}::date
      AND d.lost_time < ${filters.to}::date + INTERVAL '1 day'
      ${pipelineClause}
      ${ownerClause}
      AND ${visClause}
    GROUP BY d.lost_reason_id, coalesce(lr.name, d.lost_reason)
    ORDER BY count(*) DESC, "name" ASC NULLS LAST
  `);

  signal.throwIfAborted();
  return (result as unknown as { rows: LostReasonCount[] }).rows;
}
