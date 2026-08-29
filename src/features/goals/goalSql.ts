import { type SQL, sql } from "drizzle-orm";
import type { Goal } from "@/db/schema/goals";
import type { PermSetUser } from "@/features/permissions/effective";

export function goalSession(actor: PermSetUser) {
  return {
    userId: actor.id,
    isAdmin: actor.type === "admin",
    isActive: actor.isActive,
    sessionLive: true,
    visibilityGroupIds: Array.from(actor.groupIds),
    managedUserIds: Array.from(actor.managedUserIds ?? []),
  };
}

export function assigneeClause(goal: Goal, column: SQL): SQL {
  if (goal.assigneeKind === "company") return sql``;
  if (goal.assigneeKind === "user") return sql`AND ${column} = ${goal.assigneeId}::uuid`;
  return sql`AND ${column} IN (
    SELECT tm.user_id FROM team_members tm WHERE tm.team_id = ${goal.assigneeId}::uuid
  )`;
}

export function dealEvent(goal: Goal): { at: SQL; state: SQL } {
  if (goal.action === "won") return { at: sql`d.won_time`, state: sql`d.status = 'won' AND` };
  if (goal.action === "lost") return { at: sql`d.lost_time`, state: sql`d.status = 'lost' AND` };
  return { at: sql`d.created_at`, state: sql`` };
}

export function activityEvent(goal: Goal): { at: SQL; state: SQL } {
  return goal.action === "completed"
    ? { at: sql`a.done_at`, state: sql`a.done = true AND` }
    : { at: sql`a.created_at`, state: sql`` };
}

export function pipelineClause(goal: Goal, column: SQL): SQL {
  return goal.pipelineId !== null ? sql`AND ${column} = ${goal.pipelineId}` : sql``;
}

export function activityTypeClause(goal: Goal): SQL {
  return goal.activityTypeId !== null ? sql`AND a.type_id = ${goal.activityTypeId}::uuid` : sql``;
}
