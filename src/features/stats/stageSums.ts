// Per-stage open-deal counts and values for the dashboard (NOT the kanban board:
// the board uses deal.stageSums/dealRepo). Requires FROM deals d JOIN pipelines p
// ON p.id = d.pipeline_id so dealVisibilityClause can gate on p.visibility_group_id.
// Honors ownerScope like funnel: when scope === 'me', counts only the actor's own
// deals IN ADDITION to the always-on visibility predicate.
import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { dealVisibilityClause } from "@/features/deals/visibility";
import type { PermSetUser } from "@/features/permissions/effective";
import type { StageSum } from "@/types/stats";

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

export async function stageSums(
  db: Db,
  actor: PermSetUser,
  pipelineId: string,
  ownerScope: "me" | "all",
  signal: AbortSignal,
): Promise<StageSum[]> {
  signal.throwIfAborted();

  const visClause = dealVisibilityClause(toSession(actor));
  const ownerClause = ownerScope === "me" ? sql`AND d.owner_id = ${actor.id}::uuid` : sql``;

  // JOIN stages so each row carries its own name (mirrors how funnel.ts returns
  // names). The widget then renders names for ANY pipeline, not only the settings
  // default pipeline. Semantics otherwise unchanged: only stages that hold at
  // least one visible open deal appear.
  const result = await db.execute(sql`
    SELECT
      d.stage_id                                              AS "stageId",
      s.name                                                  AS name,
      count(*)::int                                           AS "dealCount",
      coalesce(sum(d.value), 0)::numeric(14,2)::text          AS total
    FROM deals d
    JOIN pipelines p ON p.id = d.pipeline_id
    JOIN stages s ON s.id = d.stage_id
    WHERE d.pipeline_id = ${pipelineId}
      AND d.status = 'open'
      AND d.deleted_at IS NULL
      AND d.archived_at IS NULL
      ${ownerClause}
      AND ${visClause}
    GROUP BY d.stage_id, s.name
  `);

  signal.throwIfAborted();

  const rows = (
    result as unknown as {
      rows: Array<{ stageId: string; name: string; dealCount: number; total: string }>;
    }
  ).rows;
  return rows;
}
