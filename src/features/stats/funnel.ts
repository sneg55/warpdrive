// Funnel query: per-stage count of open deals + conversion rate relative to
// the first stage. Requires JOIN pipelines p so the visibility predicate can
// gate on p.visibility_group_id (pipeline restriction).
// v1 snapshot: no date window (current resting-state count, not a time series).
// Honors ownerScope: when scope === 'me', counts only the actor's own deals
// IN ADDITION to the always-on visibility predicate.
import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { dealVisibilityClause } from "@/features/deals/visibility";
import type { PermSetUser } from "@/features/permissions/effective";
import type { FunnelStage } from "@/types/stats";

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

export async function funnel(
  db: Db,
  actor: PermSetUser,
  pipelineId: string,
  ownerScope: "me" | "all",
  signal: AbortSignal,
): Promise<FunnelStage[]> {
  signal.throwIfAborted();

  // Fetch stages ordered by their position.
  const stagesResult = await db.execute(sql`
    SELECT id, name, "order"
    FROM stages
    WHERE pipeline_id = ${pipelineId}
    ORDER BY "order" ASC
  `);
  signal.throwIfAborted();

  const stageRows = (
    stagesResult as unknown as { rows: Array<{ id: string; name: string; order: number }> }
  ).rows;

  if (stageRows.length === 0) return [];

  const visClause = dealVisibilityClause(toSession(actor));
  const ownerClause = ownerScope === "me" ? sql`AND d.owner_id = ${actor.id}::uuid` : sql``;

  // Count open deals per stage behind the visibility predicate (+ owner filter when me-scoped).
  const countsResult = await db.execute(sql`
    SELECT d.stage_id AS "stageId", count(*)::int AS c
    FROM deals d
    JOIN pipelines p ON p.id = d.pipeline_id
    WHERE d.pipeline_id = ${pipelineId}
      AND d.status = 'open'
      AND d.deleted_at IS NULL
      AND d.archived_at IS NULL
      ${ownerClause}
      AND ${visClause}
    GROUP BY d.stage_id
  `);
  signal.throwIfAborted();

  const counts = (countsResult as unknown as { rows: Array<{ stageId: string; c: number }> }).rows;

  const byStage = new Map(counts.map((r) => [r.stageId, r.c]));
  const firstStage = stageRows[0];
  const firstCount = firstStage !== undefined ? (byStage.get(firstStage.id) ?? 0) : 0;

  return stageRows.map((s) => {
    const reached = byStage.get(s.id) ?? 0;
    return {
      stageId: s.id,
      name: s.name,
      order: s.order,
      reached,
      conversion: firstCount > 0 ? reached / firstCount : 0,
    };
  });
}
