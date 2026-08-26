// What a goal has actually booked inside one period.
//
// Two scopes are at play and they are not the same: the goal names WHOSE work counts (a user,
// a team's members, or everyone), while the viewer's own visibility still decides which deals
// they are allowed to see at all. Reading a colleague's goal must never surface a deal that
// colleague can see and the viewer cannot.
import { type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { Goal } from "@/db/schema/goals";
import { dealVisibilityClause } from "@/features/deals/visibility";
import type { PermSetUser } from "@/features/permissions/effective";
import { activityVisibilityPredicate } from "@/features/stats/activityVisibilitySql";
import type { GoalPeriod } from "./goalPeriod";

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

// Whose rows count towards the goal, as a predicate on the given owner/assignee column.
// A team resolves to its current membership, so a goal follows the team as people join and
// leave rather than freezing the roster it was created with.
function assigneeClause(goal: Goal, column: SQL): SQL {
  if (goal.assigneeKind === "company") return sql``;
  if (goal.assigneeKind === "user") return sql`AND ${column} = ${goal.assigneeId}::uuid`;
  return sql`AND ${column} IN (
    SELECT tm.user_id FROM team_members tm WHERE tm.team_id = ${goal.assigneeId}::uuid
  )`;
}

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
  // Each action reads the column that records it, the same rule the dashboard counters follow.
  let windowClause: SQL;
  if (goal.action === "won") {
    windowClause = sql`d.status = 'won' AND d.won_time >= ${from} AND d.won_time < ${toExclusive}`;
  } else if (goal.action === "lost") {
    windowClause = sql`d.status = 'lost' AND d.lost_time >= ${from} AND d.lost_time < ${toExclusive}`;
  } else {
    windowClause = sql`d.created_at >= ${from} AND d.created_at < ${toExclusive}`;
  }

  const pipelineClause =
    goal.pipelineId !== null ? sql`AND d.pipeline_id = ${goal.pipelineId}` : sql``;

  const result = await db.execute(sql`
    SELECT count(*)::int AS "count",
           coalesce(sum(d.value), 0)::numeric(14,2)::text AS "value"
    FROM deals d
    JOIN pipelines p ON p.id = d.pipeline_id
    WHERE d.deleted_at IS NULL
      AND d.archived_at IS NULL
      AND p.is_archived = false
      AND ${windowClause}
      ${pipelineClause}
      ${assigneeClause(goal, sql`d.owner_id`)}
      AND ${dealVisibilityClause(toSession(actor))}
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
  const windowClause =
    goal.action === "completed"
      ? sql`a.done = true AND a.done_at >= ${from} AND a.done_at < ${toExclusive}`
      : sql`a.created_at >= ${from} AND a.created_at < ${toExclusive}`;

  const typeClause =
    goal.activityTypeId !== null ? sql`AND a.type_id = ${goal.activityTypeId}::uuid` : sql``;
  const pipelineClause =
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
      ${typeClause}
      ${pipelineClause}
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
