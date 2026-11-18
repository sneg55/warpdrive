import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { PermSetUser } from "@/features/permissions/effective";
import { ownerFilterClause } from "@/features/stats/ownerIds";
import { withinLocalDays } from "@/lib/localDayRange";
import type { ActivityTypeCount, DashboardFilters } from "@/types/stats";
import { activityVisibilityPredicate } from "./activityVisibilitySql";

export async function activitiesByType(
  db: Db,
  actor: PermSetUser,
  filters: DashboardFilters,
  signal: AbortSignal,
): Promise<ActivityTypeCount[]> {
  signal.throwIfAborted();

  const ownerClause = ownerFilterClause(sql`a.assignee_id`, filters.owners);
  const pipelineClause =
    filters.pipelineId !== null
      ? sql`AND EXISTS (
          SELECT 1 FROM deals d3 WHERE d3.id = a.deal_id AND d3.pipeline_id = ${filters.pipelineId}
        )`
      : sql``;

  const result = await db.execute(sql`
    SELECT
      t.id AS "typeId",
      t.key AS "key",
      t.name AS "name",
      count(a.id)::int AS completed
    FROM activity_types t
    LEFT JOIN activities a
      ON a.type_id = t.id
      AND a.deleted_at IS NULL
      AND a.done = true
      AND ${withinLocalDays(sql`a.done_at`, filters.from, filters.to, filters.timeZone)}
      AND ${activityVisibilityPredicate(actor, "a")}
      ${ownerClause}
      ${pipelineClause}
    WHERE t.archived_at IS NULL
    GROUP BY t.id, t.key, t.name, t."order"
    ORDER BY t."order" ASC, t.name ASC
  `);

  signal.throwIfAborted();
  return (result as unknown as { rows: ActivityTypeCount[] }).rows;
}
