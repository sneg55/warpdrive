import { type SQL, sql } from "drizzle-orm";

export interface VisibilityCtx {
  userId: string;
  isAdmin: boolean;
  isActive: boolean;
  sessionLive: boolean;
  groupIds: string[];
  managedUserIds?: string[];
}

export interface DealCols {
  ownerId: SQL;
  visibilityLevel: SQL;
  visibilityGroupId: SQL;
  visibleToUserIds: SQL;
  pipelineVisibilityGroupId: SQL;
}

export function buildUuidArray(ids: string[]): SQL {
  if (ids.length === 0) {
    return sql`ARRAY[]::uuid[]`;
  }
  const parts = ids.map((id) => sql`${id}::uuid`);
  const joined = parts.reduce((acc, part) => sql`${acc}, ${part}`);
  return sql`ARRAY[${joined}]`;
}

export function dealVisibilityPredicate(ctx: VisibilityCtx, c: DealCols): SQL {
  if (!ctx.isActive || !ctx.sessionLive) {
    return sql`FALSE`;
  }

  if (ctx.isAdmin) {
    return sql`TRUE`;
  }

  const groupArray = buildUuidArray(ctx.groupIds);
  const managedArray = buildUuidArray(ctx.managedUserIds ?? []);
  const uidArray = sql`ARRAY[${ctx.userId}::uuid]`;

  const pipelineGate = sql`(
    ${c.pipelineVisibilityGroupId} IS NULL
    OR ${c.pipelineVisibilityGroupId} = ANY(${groupArray})
  )`;

  const levelGate = sql`(
    ${c.visibleToUserIds} @> ${uidArray}
    OR ${c.ownerId} = ${ctx.userId}::uuid
    OR ${c.ownerId} = ANY(${managedArray})
    OR ${c.visibilityLevel} = 'all'
    OR (
      ${c.visibilityLevel} = 'group'
      AND ${c.visibilityGroupId} = ANY(${groupArray})
    )
  )`;

  return sql`(${pipelineGate} AND ${levelGate})`;
}
