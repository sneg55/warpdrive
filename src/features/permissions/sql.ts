import { type SQL, sql } from "drizzle-orm";

export interface VisibilityCtx {
  userId: string;
  isAdmin: boolean;
  isActive: boolean;
  sessionLive: boolean;
  groupIds: string[];
  // Team members this actor manages (populated only when they hold team.viewMembers). Records
  // owned by these users are visible to the manager. Optional and fail-closed: an absent value
  // means no team-scoped visibility (a builder can only ever UNDER-grant, never over-grant).
  managedUserIds?: string[];
}

// Column references for the deal table the predicate is applied to (so it works against
// the real deals table in Phase 2 and the test table here).
export interface DealCols {
  ownerId: SQL;
  visibilityLevel: SQL;
  visibilityGroupId: SQL;
  visibleToUserIds: SQL;
  pipelineVisibilityGroupId: SQL;
}

// Build a uuid[] literal from a JS string array, handling the empty case.
function buildUuidArray(ids: string[]): SQL {
  if (ids.length === 0) {
    return sql`ARRAY[]::uuid[]`;
  }
  // Join each id as a parameterized value separated by commas.
  const parts = ids.map((id) => sql`${id}::uuid`);
  const joined = parts.reduce((acc, part) => sql`${acc}, ${part}`);
  return sql`ARRAY[${joined}]`;
}

// SQL mirror of permissions spec 2.7 / 6.3. Any change here must change canSee.ts too.
//
// Precedence (matching canSee exactly):
//   0. !isActive OR !sessionLive -> deny all
//   1. isAdmin -> allow all (admin bypass)
//   2. pipelineVisibilityGroupId gate (restricted pipeline)
//   3. visibleToUserIds additive allow
//   4. ownership
//   5. visibilityLevel (all / group / owner)
export function dealVisibilityPredicate(ctx: VisibilityCtx, c: DealCols): SQL {
  // Rule 0: deactivated user or dead session sees nothing.
  if (!ctx.isActive || !ctx.sessionLive) {
    return sql`FALSE`;
  }

  // Rule 1: admin bypass - admin sees every row.
  if (ctx.isAdmin) {
    return sql`TRUE`;
  }

  const groupArray = buildUuidArray(ctx.groupIds);
  const managedArray = buildUuidArray(ctx.managedUserIds ?? []);
  const uidArray = sql`ARRAY[${ctx.userId}::uuid]`;

  // Rule 2: pipeline restriction gate (hard gate: must pass even if owner/all/etc).
  const pipelineGate = sql`(
    ${c.pipelineVisibilityGroupId} IS NULL
    OR ${c.pipelineVisibilityGroupId} = ANY(${groupArray})
  )`;

  // Rules 3-5 (+ team-manager view): additive allow; owner; team-managed owner; all; group. The
  // team term mirrors canSee's managesOwner and sits inside the level gate, so it is still AND'd
  // with the pipeline hard gate (a manager never bypasses a restricted pipeline).
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
