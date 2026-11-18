import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { dealVisibilityClause } from "@/features/deals/visibility";
import type { PermSetUser } from "@/features/permissions/effective";
import { ownerFilterClause } from "@/features/stats/ownerIds";
import type { OwnerIdFilter, StageSum } from "@/types/stats";

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
  owners: OwnerIdFilter,
  signal: AbortSignal,
): Promise<StageSum[]> {
  signal.throwIfAborted();

  const visClause = dealVisibilityClause(toSession(actor));
  const ownerClause = ownerFilterClause(sql`d.owner_id`, owners);

  const result = await db.execute(sql`
    SELECT
      d.stage_id                                              AS "stageId",
      s.name                                                  AS name,
      s."order"                                               AS "order",
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
    GROUP BY d.stage_id, s.name, s."order"
    ORDER BY s."order" ASC
  `);

  signal.throwIfAborted();

  const rows = (
    result as unknown as {
      rows: Array<{
        stageId: string;
        name: string;
        order: number;
        dealCount: number;
        total: string;
      }>;
    }
  ).rows;
  return rows;
}
