// Deal performance query: won/lost/open counts and values for the dashboard.
// Always applies dealVisibilityPredicate via dealVisibilityClause (requires
// FROM deals d JOIN pipelines p ON p.id = d.pipeline_id).
import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { dealVisibilityClause } from "@/features/deals/visibility";
import type { PermSetUser } from "@/features/permissions/effective";
import type { DashboardFilters, DealPerformance, MoneyBucket } from "@/types/stats";

// Build a DealVisibilitySession from a PermSetUser (same shape, different names).
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

export async function dealPerformance(
  db: Db,
  actor: PermSetUser,
  filters: DashboardFilters,
  signal: AbortSignal,
): Promise<DealPerformance> {
  signal.throwIfAborted();

  const visClause = dealVisibilityClause(toSession(actor));
  const ownerClause = filters.ownerScope === "me" ? sql`AND d.owner_id = ${actor.id}::uuid` : sql``;
  const pipelineClause =
    filters.pipelineId !== null ? sql`AND d.pipeline_id = ${filters.pipelineId}` : sql``;

  const result = await db.execute(sql`
    SELECT
      d.status,
      count(*)::int                                         AS "count",
      coalesce(sum(d.value), 0)::numeric(14,2)::text        AS value
    FROM deals d
    JOIN pipelines p ON p.id = d.pipeline_id
    WHERE d.deleted_at IS NULL
      AND d.archived_at IS NULL
      AND p.is_archived = false
      AND d.created_at >= ${filters.from}::date
      AND d.created_at <  ${filters.to}::date + INTERVAL '1 day'
      ${pipelineClause}
      ${ownerClause}
      AND ${visClause}
    GROUP BY d.status
  `);

  signal.throwIfAborted();

  const rows = (
    result as unknown as { rows: Array<{ status: string; count: number; value: string }> }
  ).rows;
  const empty: MoneyBucket = { count: 0, value: "0.00" };
  const out: DealPerformance = { won: { ...empty }, lost: { ...empty }, open: { ...empty } };
  for (const r of rows) {
    const bucket: MoneyBucket = { count: r.count, value: r.value };
    // Each of the three known statuses is handled explicitly; an unknown status
    // would mean the deal_status enum drifted, so we no-op rather than silently
    // route it into 'open' (which would corrupt the open bucket).
    if (r.status === "won") out.won = bucket;
    else if (r.status === "lost") out.lost = bucket;
    else if (r.status === "open") out.open = bucket;
  }
  return out;
}
