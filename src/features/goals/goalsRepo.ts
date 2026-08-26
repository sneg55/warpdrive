// Goal storage. Reads are scoped so a user without stats.viewOthers sees only the goals that
// are actually about them: their own, their teams', and company-wide ones.
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { teams, users } from "@/db/schema";
import { type Goal, goals } from "@/db/schema/goals";
import { can } from "@/features/permissions/can";
import type { PermSetUser } from "@/features/permissions/effective";
import type { GoalInput } from "./schemas";

export async function listVisibleGoals(
  db: Db,
  actor: PermSetUser,
  signal: AbortSignal,
): Promise<Goal[]> {
  signal.throwIfAborted();

  const mine = or(
    eq(goals.assigneeKind, "company"),
    and(eq(goals.assigneeKind, "user"), eq(goals.assigneeId, actor.id)),
    and(
      eq(goals.assigneeKind, "team"),
      sql`${goals.assigneeId} IN (
        SELECT tm.team_id FROM team_members tm WHERE tm.user_id = ${actor.id}::uuid
      )`,
    ),
  );
  const scope = can(actor, "stats.viewOthers") ? undefined : mine;

  return db
    .select()
    .from(goals)
    .where(and(isNull(goals.deletedAt), scope))
    .orderBy(desc(goals.startsOn), desc(goals.createdAt));
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
