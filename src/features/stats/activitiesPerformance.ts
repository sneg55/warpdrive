// Activity counters for the dashboard. Each counter windows on the column that records its
// own event: completed on done_at (repo.ts stamps it on the done transition), added on
// created_at, scheduled on due_at. Activities with no due date can be in no window at all,
// so they are reported as `undated` rather than silently dropped from every count.
// Visibility follows the activity's DOMINANT parent (deal > person > org > parentless), not
// the deal alone: an activity on a private person is as invisible as one on a private deal.
import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { PermSetUser } from "@/features/permissions/effective";
import type { ActivityCounters, DashboardFilters } from "@/types/stats";
import { activityVisibilityPredicate } from "./activityVisibilitySql";

export async function activitiesPerformance(
  db: Db,
  actor: PermSetUser,
  filters: DashboardFilters,
  signal: AbortSignal,
): Promise<ActivityCounters> {
  signal.throwIfAborted();

  const ownerClause =
    filters.ownerScope === "me" ? sql`AND a.assignee_id = ${actor.id}::uuid` : sql``;
  const pipelineClause =
    filters.pipelineId !== null
      ? sql`AND EXISTS (
          SELECT 1 FROM deals d3 WHERE d3.id = a.deal_id AND d3.pipeline_id = ${filters.pipelineId}
        )`
      : sql``;

  const from = sql`${filters.from}::date`;
  const toExclusive = sql`${filters.to}::date + INTERVAL '1 day'`;

  const result = await db.execute(sql`
    SELECT
      count(*) filter (
        where a.done = true AND a.done_at >= ${from} AND a.done_at < ${toExclusive}
      )::int AS completed,
      count(*) filter (
        where a.created_at >= ${from} AND a.created_at < ${toExclusive}
      )::int AS added,
      count(*) filter (
        where a.done = false AND a.due_at >= ${from} AND a.due_at < ${toExclusive}
      )::int AS scheduled,
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
