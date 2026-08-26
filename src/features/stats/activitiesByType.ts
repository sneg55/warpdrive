// Completed activities broken out by activity type, for the range.
// LEFT JOIN from activity_types so a type with no completions still returns a zero row:
// "no meetings booked this month" is a finding, and an absent row hides it.
// Visibility follows the dominant parent (deal > person > org > parentless), shared with
// activitiesPerformance and the goal totals.
import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { PermSetUser } from "@/features/permissions/effective";
import type { ActivityTypeCount, DashboardFilters } from "@/types/stats";
import { activityVisibilityPredicate } from "./activityVisibilitySql";

export async function activitiesByType(
  db: Db,
  actor: PermSetUser,
  filters: DashboardFilters,
  signal: AbortSignal,
): Promise<ActivityTypeCount[]> {
  signal.throwIfAborted();

  const ownerClause =
    filters.ownerScope === "me" ? sql`AND a.assignee_id = ${actor.id}::uuid` : sql``;
  const pipelineClause =
    filters.pipelineId !== null
      ? sql`AND EXISTS (
          SELECT 1 FROM deals d3 WHERE d3.id = a.deal_id AND d3.pipeline_id = ${filters.pipelineId}
        )`
      : sql``;

  // Every activity predicate lives in the JOIN condition, not a WHERE clause: moving any of
  // them to WHERE turns the LEFT JOIN into an inner join and the zero rows disappear.
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
      AND a.done_at >= ${filters.from}::date
      AND a.done_at < ${filters.to}::date + INTERVAL '1 day'
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
