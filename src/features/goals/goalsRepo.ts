import { and, desc, eq, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { teams, users } from "@/db/schema";
import { type Goal, goals } from "@/db/schema/goals";
import type { PermSetUser } from "@/features/permissions/effective";
import { ownerScope } from "@/features/stats/ownerScope";
import { assertNever } from "@/types/result";
import type { OwnerScope } from "@/types/stats";
import type { GoalInput } from "./schemas";

function goalsAbout(userId: string): SQL | undefined {
  return or(
    eq(goals.assigneeKind, "company"),
    and(eq(goals.assigneeKind, "user"), eq(goals.assigneeId, userId)),
    and(
      eq(goals.assigneeKind, "team"),
      sql`${goals.assigneeId} IN (
        SELECT tm.team_id FROM team_members tm WHERE tm.user_id = ${userId}::uuid
      )`,
    ),
  );
}

function goalsInScope(actor: PermSetUser, scope: OwnerScope): SQL | undefined {
  const effective = ownerScope(actor, scope);
  switch (effective.kind) {
    case "all":
      return undefined;
    case "me":
      return goalsAbout(actor.id);
    case "user":
      return goalsAbout(effective.userId);
    case "team":
      return or(
        eq(goals.assigneeKind, "company"),
        and(eq(goals.assigneeKind, "team"), eq(goals.assigneeId, effective.teamId)),
      );
    default:
      return assertNever(effective);
  }
}

export async function listVisibleGoals(
  db: Db,
  actor: PermSetUser,
  scope: OwnerScope,
  signal: AbortSignal,
): Promise<Goal[]> {
  signal.throwIfAborted();
  return db
    .select()
    .from(goals)
    .where(and(isNull(goals.deletedAt), goalsInScope(actor, scope)))
    .orderBy(desc(goals.startsOn), desc(goals.createdAt));
}

function assigneeIds(rows: Goal[], kind: Goal["assigneeKind"]): string[] {
  return [
    ...new Set(
      rows.flatMap((g) => (g.assigneeKind === kind && g.assigneeId !== null ? [g.assigneeId] : [])),
    ),
  ];
}

export async function goalAssigneeNames(
  db: Db,
  rows: Goal[],
  signal: AbortSignal,
): Promise<Map<string, string>> {
  signal.throwIfAborted();
  const userIds = assigneeIds(rows, "user");
  const teamIds = assigneeIds(rows, "team");
  const [userRows, teamRows] = await Promise.all([
    userIds.length > 0
      ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))
      : [],
    teamIds.length > 0
      ? db.select({ id: teams.id, name: teams.name }).from(teams).where(inArray(teams.id, teamIds))
      : [],
  ]);
  signal.throwIfAborted();
  return new Map([...userRows, ...teamRows].map((r) => [r.id, r.name]));
}

// assignee_id points at users or teams depending on assignee_kind, so it can carry no foreign
// key and nothing stops a goal being created against an id that does not exist. Such a goal
// would sit on the settings screen forever, unfulfillable and attributed to nobody.
export async function assigneeExists(
  db: Db,
  kind: GoalInput["assigneeKind"],
  id: string | null,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted();
  if (kind === "company" || id === null) return true;
  const table = kind === "user" ? users : teams;
  const [row] = await db.select({ id: table.id }).from(table).where(eq(table.id, id));
  return row !== undefined;
}

export async function createGoal(db: Db, input: GoalInput, signal: AbortSignal): Promise<Goal> {
  signal.throwIfAborted();
  const [row] = await db.insert(goals).values(input).returning();
  if (row === undefined) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "createGoal: no rows");
  return row;
}

export async function updateGoal(
  db: Db,
  id: string,
  input: GoalInput,
  signal: AbortSignal,
): Promise<Goal | null> {
  signal.throwIfAborted();
  const [row] = await db
    .update(goals)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(goals.id, id), isNull(goals.deletedAt)))
    .returning();
  return row ?? null;
}

// Soft delete: a goal that has been reported against stays resolvable, and the row keeps the
// history of what the target used to be.
export async function deleteGoal(db: Db, id: string, signal: AbortSignal): Promise<boolean> {
  signal.throwIfAborted();
  const rows = await db
    .update(goals)
    .set({ deletedAt: new Date() })
    .where(and(eq(goals.id, id), isNull(goals.deletedAt)))
    .returning({ id: goals.id });
  return rows.length > 0;
}
