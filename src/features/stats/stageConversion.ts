// Funnel: how far the deals created in the range actually got, and how long they sat in each
// stage. Reads the stage history dealMove writes to change_logs (entity_type 'deal', field
// 'stageId', jsonb string values), not the deal's current stage alone.
//
// Windowed on created_at: a conversion rate is only meaningful over a cohort, so the range
// selects which deals started in the period, then measures how far that cohort progressed.
import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { dealVisibilityClause } from "@/features/deals/visibility";
import type { PermSetUser } from "@/features/permissions/effective";
import type { DashboardFilters, StageConversionRow } from "@/types/stats";

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
  stageId: string;
  name: string;
  order: number;
  reached: number;
  medianDaysInStage: number | null;
}

export async function stageConversion(
  db: Db,
  actor: PermSetUser,
  filters: DashboardFilters & { pipelineId: string },
  signal: AbortSignal,
): Promise<StageConversionRow[]> {
  signal.throwIfAborted();

  const visClause = dealVisibilityClause(toSession(actor));
  const ownerClause = filters.ownerScope === "me" ? sql`AND d.owner_id = ${actor.id}::uuid` : sql``;

  const result = await db.execute(sql`
    WITH visible AS (
      SELECT d.id, d.stage_id, d.created_at,
             coalesce(d.won_time, d.lost_time, now()) AS closed_at
      FROM deals d
      JOIN pipelines p ON p.id = d.pipeline_id
      WHERE d.deleted_at IS NULL
        AND d.archived_at IS NULL
        AND p.is_archived = false
        AND d.pipeline_id = ${filters.pipelineId}
        AND d.created_at >= ${filters.from}::date
        AND d.created_at < ${filters.to}::date + INTERVAL '1 day'
        ${ownerClause}
        AND ${visClause}
    ),
    moves AS (
      SELECT cl.entity_id AS deal_id,
             cl.created_at AS at,
             (cl.old_value #>> '{}')::uuid AS from_stage,
             (cl.new_value #>> '{}')::uuid AS to_stage,
             row_number() OVER (PARTITION BY cl.entity_id ORDER BY cl.created_at) AS rn
      FROM change_logs cl
      JOIN visible v ON v.id = cl.entity_id
      WHERE cl.entity_type = 'deal' AND cl.field = 'stageId'
    ),
    -- Furthest stage each deal reached: the highest-ordered stage it ever entered, or its
    -- current one when it never moved. A deal that went forwards then back still counts as
    -- having reached the far stage, which is what a funnel measures.
    furthest AS (
      SELECT v.id AS deal_id,
             greatest(
               coalesce(cur."order", -1),
               coalesce((
                 SELECT max(s2."order")
                 FROM moves m
                 JOIN stages s2 ON s2.id = m.to_stage
                 WHERE m.deal_id = v.id
               ), -1)
             ) AS max_order
      FROM visible v
      LEFT JOIN stages cur ON cur.id = v.stage_id
    ),
    -- One row per stay in a stage. The first move's old_value names the stage the deal was
    -- created in, which is the only record of it.
    intervals AS (
      SELECT m.deal_id, m.from_stage AS stage_id, v.created_at AS started, m.at AS ended
      FROM moves m JOIN visible v ON v.id = m.deal_id
      WHERE m.rn = 1
      UNION ALL
      SELECT m.deal_id, m.to_stage, m.at,
             coalesce(lead(m.at) OVER (PARTITION BY m.deal_id ORDER BY m.at), v.closed_at)
      FROM moves m JOIN visible v ON v.id = m.deal_id
      UNION ALL
      SELECT v.id, v.stage_id, v.created_at, v.closed_at
      FROM visible v
      WHERE NOT EXISTS (SELECT 1 FROM moves m WHERE m.deal_id = v.id)
    ),
    dwell AS (
      SELECT stage_id,
             percentile_cont(0.5) WITHIN GROUP (
               ORDER BY extract(epoch FROM (ended - started)) / 86400
             )::float8 AS median_days
      FROM intervals
      WHERE ended IS NOT NULL
      GROUP BY stage_id
    )
    SELECT s.id AS "stageId",
           s.name AS "name",
           s."order" AS "order",
           (SELECT count(*) FROM furthest f WHERE f.max_order >= s."order")::int AS reached,
           dw.median_days AS "medianDaysInStage"
    FROM stages s
    LEFT JOIN dwell dw ON dw.stage_id = s.id
    WHERE s.pipeline_id = ${filters.pipelineId}
    ORDER BY s."order" ASC
  `);

  signal.throwIfAborted();

  const rows = (result as unknown as { rows: Row[] }).rows;
  const first = rows[0];
  // Conversion is measured against the first stage: every deal passes through it, so it is
  // the only honest denominator. Zero there means zero everywhere, and the rate is 0.
  const base = first?.reached ?? 0;
  return rows.map((r) => ({
    stageId: r.stageId,
    name: r.name,
    order: r.order,
    reached: r.reached,
    conversion: base > 0 ? r.reached / base : 0,
    medianDaysInStage: r.medianDaysInStage,
  }));
}
