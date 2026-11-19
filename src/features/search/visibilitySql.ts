import { type SQL, sql } from "drizzle-orm";
import type { PermSetUser } from "@/features/permissions/effective";
import {
  type DealCols,
  dealVisibilityPredicate,
  type VisibilityCtx,
} from "@/features/permissions/sql";

export function toVisibilityCtx(actor: PermSetUser): VisibilityCtx {
  return {
    userId: actor.id,
    isAdmin: actor.type === "admin",
    isActive: actor.isActive,
    sessionLive: true,
    groupIds: Array.from(actor.groupIds),
    managedUserIds: Array.from(actor.managedUserIds ?? []),
  };
}

function recordCols(alias: string): DealCols {
  const col = (name: string) => sql.raw(`${alias}.${name}`);
  return {
    ownerId: col("owner_id"),
    visibilityLevel: col("visibility_level"),
    visibilityGroupId: col("visibility_group_id"),
    visibleToUserIds: col("visible_to_user_ids"),
    pipelineVisibilityGroupId: sql`NULL::uuid`,
  };
}

export function recordVisibility(ctx: VisibilityCtx, alias: string): SQL {
  return dealVisibilityPredicate(ctx, recordCols(alias));
}

export function dealRecordVisibility(
  ctx: VisibilityCtx,
  dealAlias: string,
  pipelineAlias: string,
): SQL {
  return dealVisibilityPredicate(ctx, {
    ...recordCols(dealAlias),
    pipelineVisibilityGroupId: sql.raw(`${pipelineAlias}.visibility_group_id`),
  });
}

export function visibleDealExists(ctx: VisibilityCtx, dealIdExpr: SQL): SQL {
  return sql`EXISTS (
    SELECT 1 FROM deals vd JOIN pipelines vp ON vp.id = vd.pipeline_id
    WHERE vd.id = ${dealIdExpr} AND vd.deleted_at IS NULL AND vp.is_archived = false
      AND ${dealRecordVisibility(ctx, "vd", "vp")}
  )`;
}

export function visiblePersonExists(ctx: VisibilityCtx, personIdExpr: SQL): SQL {
  return sql`EXISTS (
    SELECT 1 FROM persons vpe
    WHERE vpe.id = ${personIdExpr} AND vpe.deleted_at IS NULL AND ${recordVisibility(ctx, "vpe")}
  )`;
}

export function visibleOrgExists(ctx: VisibilityCtx, orgIdExpr: SQL): SQL {
  return sql`EXISTS (
    SELECT 1 FROM organizations vo
    WHERE vo.id = ${orgIdExpr} AND vo.deleted_at IS NULL AND ${recordVisibility(ctx, "vo")}
  )`;
}
