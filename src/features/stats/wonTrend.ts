// Won deal count and value per month across the dashboard range. The only stats query that
// answers "which way is this going" rather than "where does it rest right now".
// Windows on won_time (see dealPerformance for why) and applies dealVisibilityClause.
import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { dealVisibilityClause } from "@/features/deals/visibility";
import type { PermSetUser } from "@/features/permissions/effective";
import type { DashboardFilters, WonTrendPoint } from "@/types/stats";
import { monthsInRange, windowStart } from "./monthBuckets";

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

interface Row {
  month: string;
  count: number;
  value: string;
}

export async function wonTrend(
  db: Db,
  actor: PermSetUser,
  filters: DashboardFilters,
  signal: AbortSignal,
): Promise<WonTrendPoint[]> {
  signal.throwIfAborted();

  const months = monthsInRange(filters.from, filters.to);
  const start = windowStart(filters.from, months);
  if (start === null) return [];

  const visClause = dealVisibilityClause(toSession(actor));
  const ownerClause = filters.ownerScope === "me" ? sql`AND d.owner_id = ${actor.id}::uuid` : sql``;
  const pipelineClause =
    filters.pipelineId !== null ? sql`AND d.pipeline_id = ${filters.pipelineId}` : sql``;

  const result = await db.execute(sql`
    SELECT
      to_char(date_trunc('month', d.won_time), 'YYYY-MM') AS "month",
      count(*)::int AS "count",
      coalesce(sum(d.value), 0)::numeric(14,2)::text AS "value"
    FROM deals d
    JOIN pipelines p ON p.id = d.pipeline_id
    WHERE d.deleted_at IS NULL
      AND d.archived_at IS NULL
      AND p.is_archived = false
      AND d.status = 'won'
      AND d.won_time >= ${start}::date
      AND d.won_time < ${filters.to}::date + INTERVAL '1 day'
      ${pipelineClause}
      ${ownerClause}
      AND ${visClause}
    GROUP BY 1
  `);

  signal.throwIfAborted();

  const byMonth = new Map<string, Row>();
  for (const row of (result as unknown as { rows: Row[] }).rows) byMonth.set(row.month, row);

  return months.map((month) => {
    const row = byMonth.get(month);
    return {
      month,
      count: row?.count ?? 0,
      value: row?.value ?? "0.00",
    };
  });
}
