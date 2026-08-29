// What a goal has actually booked inside one period.
//
// Two scopes are at play and they are not the same: the goal names WHOSE work counts (a user,
// a team's members, or everyone), while the viewer's own visibility still decides which deals
// they are allowed to see at all. Reading a colleague's goal must never surface a deal that
// colleague can see and the viewer cannot.
import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { Goal } from "@/db/schema/goals";
import { dealVisibilityClause } from "@/features/deals/visibility";
import type { PermSetUser } from "@/features/permissions/effective";
import { activityVisibilityPredicate } from "@/features/stats/activityVisibilitySql";
import type { GoalPeriod } from "./goalPeriod";
import {
  activityEvent,
  activityTypeClause,
  assigneeClause,
  dealEvent,
  goalSession,
  pipelineClause,
} from "./goalSql";

interface Totals {
  count: number;
  value: string;
}

async function dealTotals(
  db: Db,
  actor: PermSetUser,
  goal: Goal,
  period: GoalPeriod,
  signal: AbortSignal,
): Promise<Totals> {
  const from = sql`${period.start}::date`;
  const toExclusive = sql`${period.end}::date + INTERVAL '1 day'`;
  const { at, state } = dealEvent(goal);
  const windowClause = sql`${state} ${at} >= ${from} AND ${at} < ${toExclusive}`;

  const result = await db.execute(sql`
    SELECT count(*)::int AS "count",
           coalesce(sum(d.value), 0)::numeric(14,2)::text AS "value"
    FROM deals d
    JOIN pipelines p ON p.id = d.pipeline_id
    WHERE d.deleted_at IS NULL
      AND d.archived_at IS NULL
      AND p.is_archived = false
      AND ${windowClause}
      ${pipelineClause(goal, sql`d.pipeline_id`)}
      ${assigneeClause(goal, sql`d.owner_id`)}
      AND ${dealVisibilityClause(goalSession(actor))}
  `);
  signal.throwIfAborted();
  const row = (result as unknown as { rows: Totals[] }).rows[0];
  return { count: row?.count ?? 0, value: row?.value ?? "0.00" };
}

async function activityTotals(
  db: Db,
  actor: PermSetUser,
  goal: Goal,
  period: GoalPeriod,
  signal: AbortSignal,
): Promise<Totals> {
  const from = sql`${period.start}::date`;
  const toExclusive = sql`${period.end}::date + INTERVAL '1 day'`;
  const { at, state } = activityEvent(goal);
  const windowClause = sql`${state} ${at} >= ${from} AND ${at} < ${toExclusive}`;
  const dealPipelineClause =
    goal.pipelineId !== null
      ? sql`AND EXISTS (
          SELECT 1 FROM deals d3 WHERE d3.id = a.deal_id AND d3.pipeline_id = ${goal.pipelineId}
        )`
      : sql``;

  const result = await db.execute(sql`
    SELECT count(*)::int AS "count"
    FROM activities a
    WHERE a.deleted_at IS NULL
      AND ${windowClause}
      ${activityTypeClause(goal)}
      ${dealPipelineClause}
      ${assigneeClause(goal, sql`a.assignee_id`)}
      AND ${activityVisibilityPredicate(actor, "a")}
  `);
  signal.throwIfAborted();
  const row = (result as unknown as { rows: { count: number }[] }).rows[0];
  return { count: row?.count ?? 0, value: "0.00" };
}

// The booked figure for one goal in one period, as a decimal string in the goal's own metric.
export async function goalActual(
  db: Db,
  actor: PermSetUser,
  goal: Goal,
  period: GoalPeriod,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  const totals =
    goal.subject === "deal"
      ? await dealTotals(db, actor, goal, period, signal)
      : await activityTotals(db, actor, goal, period, signal);
  return goal.metric === "value" ? totals.value : String(totals.count);
}
