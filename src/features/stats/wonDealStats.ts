// Average and median size of deals won in the range, plus how long they took to win.
// One scan over the same set for both, since "the deals won in this period" is the only
// population either metric cares about.
// Windows on won_time (see dealPerformance for why), and applies dealVisibilityClause.
import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { dealVisibilityClause } from "@/features/deals/visibility";
import type { PermSetUser } from "@/features/permissions/effective";
import type { DashboardFilters, WonDealStats } from "@/types/stats";

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
  avgValue: string | null;
  medianValue: string | null;
  avgCycleDays: number | null;
  medianCycleDays: number | null;
}

export async function wonDealStats(
  db: Db,
  actor: PermSetUser,
  filters: DashboardFilters,
  signal: AbortSignal,
): Promise<WonDealStats> {
  signal.throwIfAborted();

  const visClause = dealVisibilityClause(toSession(actor));
  const ownerClause = filters.ownerScope === "me" ? sql`AND d.owner_id = ${actor.id}::uuid` : sql``;
  const pipelineClause =
    filters.pipelineId !== null ? sql`AND d.pipeline_id = ${filters.pipelineId}` : sql``;

  // Every aggregate is null over an empty set, which is exactly the distinction the UI needs:
  // "no deals won" must not render as an average of zero.
  const result = await db.execute(sql`
    SELECT
      avg(d.value)::numeric(14,2)::text AS "avgValue",
      percentile_cont(0.5) WITHIN GROUP (ORDER BY d.value)::numeric(14,2)::text AS "medianValue",
      avg(extract(epoch FROM (d.won_time - d.created_at)) / 86400)::float8 AS "avgCycleDays",
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY extract(epoch FROM (d.won_time - d.created_at)) / 86400
      )::float8 AS "medianCycleDays"
    FROM deals d
    JOIN pipelines p ON p.id = d.pipeline_id
    WHERE d.deleted_at IS NULL
      AND d.archived_at IS NULL
      AND p.is_archived = false
      AND d.status = 'won'
      AND d.won_time >= ${filters.from}::date
      AND d.won_time < ${filters.to}::date + INTERVAL '1 day'
      ${pipelineClause}
      ${ownerClause}
      AND ${visClause}
  `);

  signal.throwIfAborted();

  const row = (result as unknown as { rows: Row[] }).rows[0];
  return {
    avgValue: row?.avgValue ?? null,
    medianValue: row?.medianValue ?? null,
    avgCycleDays: row?.avgCycleDays ?? null,
    medianCycleDays: row?.medianCycleDays ?? null,
  };
}
