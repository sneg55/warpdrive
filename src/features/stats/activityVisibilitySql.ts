import { type SQL, sql } from "drizzle-orm";
import type { PermSetUser } from "@/features/permissions/effective";
import { dealVisibilityPredicate, type VisibilityCtx } from "@/features/permissions/sql";

function toVisibilityCtx(actor: PermSetUser): VisibilityCtx {
  return {
    userId: actor.id,
    isAdmin: actor.type === "admin",
    isActive: actor.isActive,
    sessionLive: true,
    groupIds: Array.from(actor.groupIds),
    managedUserIds: Array.from(actor.managedUserIds ?? []),
  };
}

function contactCols(alias: string) {
  return {
    ownerId: sql.raw(`${alias}.owner_id`),
    visibilityLevel: sql.raw(`${alias}.visibility_level`),
    visibilityGroupId: sql.raw(`${alias}.visibility_group_id`),
    visibleToUserIds: sql.raw(`${alias}.visible_to_user_ids`),
    pipelineVisibilityGroupId: sql`NULL::uuid`,
  } as const;
}

const DEAL_COLS_D2 = {
  ownerId: sql`d2.owner_id`,
  visibilityLevel: sql`d2.visibility_level`,
  visibilityGroupId: sql`d2.visibility_group_id`,
  visibleToUserIds: sql`d2.visible_to_user_ids`,
  pipelineVisibilityGroupId: sql`p2.visibility_group_id`,
} as const;

export function activityVisibilityPredicate(actor: PermSetUser, alias: string): SQL {
  const ctx = toVisibilityCtx(actor);
  const a = (col: string) => sql.raw(`${alias}.${col}`);

  return sql`CASE
    WHEN ${a("deal_id")} IS NOT NULL THEN EXISTS (
      SELECT 1 FROM deals d2
      JOIN pipelines p2 ON p2.id = d2.pipeline_id
      WHERE d2.id = ${a("deal_id")}
        AND d2.deleted_at IS NULL
        AND p2.is_archived = false
        AND ${dealVisibilityPredicate(ctx, DEAL_COLS_D2)}
    )
    WHEN ${a("person_id")} IS NOT NULL THEN EXISTS (
      SELECT 1 FROM persons pe2
      WHERE pe2.id = ${a("person_id")}
        AND pe2.deleted_at IS NULL
        AND ${dealVisibilityPredicate(ctx, contactCols("pe2"))}
    )
    WHEN ${a("org_id")} IS NOT NULL THEN EXISTS (
      SELECT 1 FROM organizations o2
      WHERE o2.id = ${a("org_id")}
        AND o2.deleted_at IS NULL
        AND ${dealVisibilityPredicate(ctx, contactCols("o2"))}
    )
    -- Parentless (a lead-scoped activity lands here too): visible to its assignee and the
    -- people invited to it, nobody else. Admins are already short-circuited above.
    ELSE (
      ${ctx.isAdmin ? sql`TRUE` : sql`FALSE`}
      OR ${a("assignee_id")} = ${actor.id}::uuid
      OR EXISTS (
        SELECT 1 FROM activity_participants ap2
        WHERE ap2.activity_id = ${a("id")} AND ap2.user_id = ${actor.id}::uuid
      )
    )
  END`;
}
