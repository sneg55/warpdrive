import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { Goal } from "@/db/schema/goals";
import { dealVisibilityClause } from "@/features/deals/visibility";
import type { PermSetUser } from "@/features/permissions/effective";
import { activityVisibilityPredicate } from "@/features/stats/activityVisibilitySql";
import { type GoalPeriod, periodDays } from "./goalPeriod";
import {
  activityEvent,
  activityTypeClause,
  assigneeClause,
  dealEvent,
  goalSession,
  pipelineClause,
} from "./goalSql";

export interface GoalSeriesPoint {
  day: string;
  actual: string;
}

interface DayTotal {
  day: string;
  count: number;
  value: string;
}

async function dealDays(
  db: Db,
  actor: PermSetUser,
  goal: Goal,
  from: string,
  through: string,
  signal: AbortSignal,
): Promise<DayTotal[]> {
  const { at, state } = dealEvent(goal);
  const result = await db.execute(sql`
    SELECT ${at}::date::text AS "day",
           count(*)::int AS "count",
           coalesce(sum(d.value), 0)::numeric(14,2)::text AS "value"
    FROM deals d
    JOIN pipelines p ON p.id = d.pipeline_id
    WHERE d.deleted_at IS NULL
      AND d.archived_at IS NULL
      AND p.is_archived = false
      AND ${state} ${at} >= ${from}::date
      AND ${at} < ${through}::date + INTERVAL '1 day'
      ${pipelineClause(goal, sql`d.pipeline_id`)}
      ${assigneeClause(goal, sql`d.owner_id`)}
      AND ${dealVisibilityClause(goalSession(actor))}
    GROUP BY 1
  `);
  signal.throwIfAborted();
  return (result as unknown as { rows: DayTotal[] }).rows;
}

async function activityDays(
  db: Db,
  actor: PermSetUser,
  goal: Goal,
  from: string,
  through: string,
  signal: AbortSignal,
): Promise<DayTotal[]> {
  const { at, state } = activityEvent(goal);
  const dealPipelineClause =
    goal.pipelineId !== null
      ? sql`AND EXISTS (
          SELECT 1 FROM deals d3 WHERE d3.id = a.deal_id AND d3.pipeline_id = ${goal.pipelineId}
        )`
      : sql``;
  const result = await db.execute(sql`
    SELECT ${at}::date::text AS "day", count(*)::int AS "count", '0.00' AS "value"
    FROM activities a
    WHERE a.deleted_at IS NULL
      AND ${state} ${at} >= ${from}::date
      AND ${at} < ${through}::date + INTERVAL '1 day'
      ${activityTypeClause(goal)}
      ${dealPipelineClause}
      ${assigneeClause(goal, sql`a.assignee_id`)}
      AND ${activityVisibilityPredicate(actor, "a")}
    GROUP BY 1
  `);
  signal.throwIfAborted();
  return (result as unknown as { rows: DayTotal[] }).rows;
}

function accumulate(
  days: string[],
  totals: Map<string, DayTotal>,
  metric: Goal["metric"],
): GoalSeriesPoint[] {
  let running = 0;
  return days.map((day) => {
    const total = totals.get(day);
    if (total !== undefined) {
      running += metric === "value" ? Math.round(Number(total.value) * 100) : total.count;
    }
    return { day, actual: metric === "value" ? (running / 100).toFixed(2) : String(running) };
  });
}

export async function goalSeries(
  db: Db,
  actor: PermSetUser,
  goal: Goal,
  period: GoalPeriod,
  on: string,
  signal: AbortSignal,
): Promise<GoalSeriesPoint[]> {
  signal.throwIfAborted();
  const days = periodDays(period).filter((d) => d <= on);
  const through = days.at(-1);
  if (through === undefined) return [];

  const rows =
    goal.subject === "deal"
      ? await dealDays(db, actor, goal, period.start, through, signal)
      : await activityDays(db, actor, goal, period.start, through, signal);
  return accumulate(days, new Map(rows.map((r) => [r.day, r])), goal.metric);
}
