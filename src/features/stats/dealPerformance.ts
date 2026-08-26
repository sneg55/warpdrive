// Deal counters for the dashboard: added, won, lost, and an open snapshot.
// Each counter windows on the column that records its own event. dealUpdate.ts stamps
// won_time/lost_time on the status transition, so a closed deal always carries the date it
// closed. Open deals have no close date, so they are a resting-state snapshot rather than a
// windowed count.
// Always applies dealVisibilityPredicate via dealVisibilityClause (requires
// FROM deals d JOIN pipelines p ON p.id = d.pipeline_id).
import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { dealVisibilityClause } from "@/features/deals/visibility";
import type { PermSetUser } from "@/features/permissions/effective";
import type { DashboardFilters, DealCounters, MoneyBucket } from "@/types/stats";

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

interface CounterRow {
  addedCount: number;
  addedValue: string;
  wonCount: number;
  wonValue: string;
  lostCount: number;
  lostValue: string;
  openCount: number;
  openValue: string;
}

export async function dealPerformance(
  db: Db,
  actor: PermSetUser,
  filters: DashboardFilters,
  signal: AbortSignal,
): Promise<DealCounters> {
  signal.throwIfAborted();

  const visClause = dealVisibilityClause(toSession(actor));
  const ownerClause = filters.ownerScope === "me" ? sql`AND d.owner_id = ${actor.id}::uuid` : sql``;
  const pipelineClause =
    filters.pipelineId !== null ? sql`AND d.pipeline_id = ${filters.pipelineId}` : sql``;

  const from = sql`${filters.from}::date`;
  const toExclusive = sql`${filters.to}::date + INTERVAL '1 day'`;
  const addedIn = sql`d.created_at >= ${from} AND d.created_at < ${toExclusive}`;
  const wonIn = sql`d.status = 'won' AND d.won_time >= ${from} AND d.won_time < ${toExclusive}`;
  const lostIn = sql`d.status = 'lost' AND d.lost_time >= ${from} AND d.lost_time < ${toExclusive}`;
  const isOpen = sql`d.status = 'open'`;

  const result = await db.execute(sql`
    SELECT
      count(*) filter (where ${addedIn})::int AS "addedCount",
      coalesce(sum(d.value) filter (where ${addedIn}), 0)::numeric(14,2)::text AS "addedValue",
      count(*) filter (where ${wonIn})::int AS "wonCount",
      coalesce(sum(d.value) filter (where ${wonIn}), 0)::numeric(14,2)::text AS "wonValue",
      count(*) filter (where ${lostIn})::int AS "lostCount",
      coalesce(sum(d.value) filter (where ${lostIn}), 0)::numeric(14,2)::text AS "lostValue",
      count(*) filter (where ${isOpen})::int AS "openCount",
      coalesce(sum(d.value) filter (where ${isOpen}), 0)::numeric(14,2)::text AS "openValue"
    FROM deals d
    JOIN pipelines p ON p.id = d.pipeline_id
    WHERE d.deleted_at IS NULL
      AND d.archived_at IS NULL
      AND p.is_archived = false
      ${pipelineClause}
      ${ownerClause}
      AND ${visClause}
  `);

  signal.throwIfAborted();

  const row = (result as unknown as { rows: CounterRow[] }).rows[0];
  const empty: MoneyBucket = { count: 0, value: "0.00" };
  if (row === undefined) {
    return { added: { ...empty }, won: { ...empty }, lost: { ...empty }, open: { ...empty } };
  }
  return {
    added: { count: row.addedCount, value: row.addedValue },
    won: { count: row.wonCount, value: row.wonValue },
    lost: { count: row.lostCount, value: row.lostValue },
    open: { count: row.openCount, value: row.openValue },
  };
}
