import { type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { PermSetUser } from "@/features/permissions/effective";
import { ownerFilterClause } from "@/features/stats/ownerIds";
import { withinLocalDays } from "@/lib/localDayRange";
import type { ActivityCounters, DashboardFilters } from "@/types/stats";
import { activityVisibilityPredicate } from "./activityVisibilitySql";

export async function activitiesPerformance(
  db: Db,
  actor: PermSetUser,
  filters: DashboardFilters,
  signal: AbortSignal,
): Promise<ActivityCounters> {
  signal.throwIfAborted();

  const ownerClause = ownerFilterClause(sql`a.assignee_id`, filters.owners);
  const pipelineClause =
    filters.pipelineId !== null
      ? sql`AND EXISTS (
          SELECT 1 FROM deals d3 WHERE d3.id = a.deal_id AND d3.pipeline_id = ${filters.pipelineId}
        )`
      : sql``;

  const within = (column: SQL) =>
    withinLocalDays(column, filters.from, filters.to, filters.timeZone);

  const result = await db.execute(sql`
    SELECT
      count(*) filter (where a.done = true AND ${within(sql`a.done_at`)})::int AS completed,
      count(*) filter (where ${within(sql`a.created_at`)})::int AS added,
      count(*) filter (where a.done = false AND ${within(sql`a.due_at`)})::int AS scheduled,
      count(*) filter (where a.done = false AND a.due_at IS NULL)::int AS undated
    FROM activities a
    WHERE a.deleted_at IS NULL
      AND ${activityVisibilityPredicate(actor, "a")}
      ${ownerClause}
      ${pipelineClause}
  `);

  signal.throwIfAborted();

  const rows = (
    result as unknown as {
      rows: Array<{ completed: number; added: number; scheduled: number; undated: number }>;
    }
  ).rows;
  const row = rows[0];
  return {
    completed: row?.completed ?? 0,
    added: row?.added ?? 0,
    scheduled: row?.scheduled ?? 0,
    undated: row?.undated ?? 0,
  };
}
