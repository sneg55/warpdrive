import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { teamMembers, teams, users } from "@/db/schema";
import type { PermSetUser } from "@/features/permissions/effective";
import { err, ok, type Result } from "@/types/result";

function requireManage(actor: PermSetUser): Result<true, string> {
  if (actor.type === "admin" || actor.flags.has("permissions.manage")) return ok(true);
  return err("permissions.manage required");
}

export function listTeams(db: Db, signal: AbortSignal) {
  signal.throwIfAborted();
  return db.select().from(teams);
}

export async function listTeamMembers(
  db: Db,
  teamId: string,
  signal: AbortSignal,
): Promise<Array<{ userId: string; name: string }>> {
  signal.throwIfAborted();
  const rows = await db
    .select({ userId: teamMembers.userId, name: users.name })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, teamId));
  return rows.map((r) => ({ userId: r.userId, name: r.name }));
}

export async function updateTeam(
  db: Db,
  actor: PermSetUser,
  input: { teamId: string; name: string; managerId: string | null },
  signal: AbortSignal,
): Promise<Result<true, string>> {
  const gate = requireManage(actor);
  if (gate.ok === false) return gate;
  signal.throwIfAborted();
  const [row] = await db
    .update(teams)
    .set({ name: input.name, managerId: input.managerId })
    .where(eq(teams.id, input.teamId))
    .returning();
  if (row === undefined) return err("team not found");
  return ok(true);
}

export async function deleteTeam(
  db: Db,
  actor: PermSetUser,
  teamId: string,
  signal: AbortSignal,
): Promise<Result<true, string>> {
  const gate = requireManage(actor);
  if (gate.ok === false) return gate;
  signal.throwIfAborted();
  await db.delete(teams).where(eq(teams.id, teamId));
  return ok(true);
}

export async function createTeam(
  db: Db,
  actor: PermSetUser,
  input: { name: string; managerId: string | null },
  signal: AbortSignal,
): Promise<Result<{ id: string }, string>> {
  const gate = requireManage(actor);
  if (gate.ok === false) return gate;
  signal.throwIfAborted();
  const [row] = await db
    .insert(teams)
    .values({ name: input.name, managerId: input.managerId })
    .returning();
  if (row === undefined) return err("create failed");
  return ok({ id: row.id });
}

export async function setTeamMembers(
  db: Db,
  actor: PermSetUser,
  input: { teamId: string; userIds: string[] },
  signal: AbortSignal,
): Promise<Result<true, string>> {
  const gate = requireManage(actor);
  if (gate.ok === false) return gate;
  signal.throwIfAborted();
  await db.transaction(async (tx) => {
    await tx.delete(teamMembers).where(eq(teamMembers.teamId, input.teamId));
    if (input.userIds.length > 0) {
      await tx
        .insert(teamMembers)
        .values(input.userIds.map((userId) => ({ teamId: input.teamId, userId })));
    }
  });
  signal.throwIfAborted();
  return ok(true);
}
