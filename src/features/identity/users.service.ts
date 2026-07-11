import { and, eq, isNull, sql } from "drizzle-orm";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import type { Db } from "@/db/client";
import { permissionSets, sessions, users } from "@/db/schema";
import type { PermSetUser } from "@/features/permissions/effective";
import { err, ok, type Result } from "@/types/result";
import { recordAudit } from "./audit";
import {
  canAssignPermissionSet,
  canDeactivateUser,
  canDemoteAdmin,
  canGrantFlags,
  canToggleAdminRole,
} from "./guards";

export function listUsers(db: Db, signal: AbortSignal) {
  signal.throwIfAborted();
  return db.select().from(users);
}

// Active users projected to { id, name } for owner/assignee pickers. Deliberately
// NOT listUsers (which returns full rows and is MANAGE-gated): this read is ungated
// so any actor holding deal.changeOwner can populate the picker. The write path
// (changeOwner) remains the real authority + active-check.
export function listAssignableUsers(
  db: Db,
  signal: AbortSignal,
): Promise<{ id: string; name: string; avatarUrl: string | null }[]> {
  signal.throwIfAborted();
  return db
    .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.isActive, true));
}

export async function assignPermissionSet(
  db: Db,
  actor: PermSetUser,
  input: { userId: string; setId: string },
  signal: AbortSignal,
): Promise<Result<true, string>> {
  const gate = canAssignPermissionSet(actor, { targetUserId: input.userId });
  if (gate.ok === false) return gate;

  // Escalation gate (F11): assigning a set that CARRIES high-risk flags is admin-only, the
  // same policy as granting them via create/update. Without this a non-admin manager could
  // hand another account permissions.manage / pipeline.manage / data.export by assignment.
  if (actor.type !== "admin") {
    const [set] = await db
      .select({ flags: permissionSets.flags })
      .from(permissionSets)
      .where(eq(permissionSets.id, input.setId))
      .limit(1);
    if (set === undefined) return err("permission set not found");
    const enabled = Object.entries(set.flags)
      .filter(([, v]) => v === true)
      .map(([k]) => k as PermissionFlagKey);
    const grantGate = canGrantFlags(actor, enabled);
    if (grantGate.ok === false) return grantGate;
  }

  signal.throwIfAborted();
  await db.update(users).set({ permissionSetId: input.setId }).where(eq(users.id, input.userId));
  await recordAudit(
    db,
    {
      actorId: actor.id,
      targetType: "user",
      targetId: input.userId,
      action: "user.assign_permission_set",
      after: { setId: input.setId },
    },
    signal,
  );
  return ok(true);
}

export async function setUserAdmin(
  db: Db,
  actor: PermSetUser,
  input: { userId: string; isAdmin: boolean },
  signal: AbortSignal,
): Promise<Result<true, string>> {
  const gate = canToggleAdminRole(actor);
  if (gate.ok === false) return gate;
  if (input.userId === actor.id && input.isAdmin === true) return err("cannot self-promote");

  // Demotion (last-admin lockout guard, F6): the count read and the update must be atomic
  // wrt other admin-state changes, or two concurrent demotions each see count > 1 and both
  // proceed, zeroing out admins. Serialize by locking every active-admin row FOR UPDATE
  // inside one transaction; a concurrent demotion blocks, then re-reads the reduced count.
  if (input.isAdmin === false) {
    signal.throwIfAborted();
    const result = await db.transaction(async (tx): Promise<Result<true, string>> => {
      const locked = await tx.execute(
        sql`SELECT id FROM users WHERE is_admin = true AND is_active = true FOR UPDATE`,
      );
      const [target] = await tx
        .select({ isAdmin: users.isAdmin })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (target === undefined) return err("not_found");
      const demoteGate = canDemoteAdmin({
        targetIsAdmin: target.isAdmin,
        isDemotion: true,
        activeAdminCount: locked.rows.length,
      });
      if (demoteGate.ok === false) return demoteGate;
      await tx.update(users).set({ isAdmin: false }).where(eq(users.id, input.userId));
      return ok(true);
    });
    if (result.ok === false) return result;
    await recordAdminChange(db, actor.id, input.userId, false, signal);
    return ok(true);
  }

  signal.throwIfAborted();
  await db.update(users).set({ isAdmin: true }).where(eq(users.id, input.userId));
  await recordAdminChange(db, actor.id, input.userId, true, signal);
  return ok(true);
}

function recordAdminChange(
  db: Db,
  actorId: string,
  targetId: string,
  isAdmin: boolean,
  signal: AbortSignal,
): Promise<void> {
  return recordAudit(
    db,
    {
      actorId,
      targetType: "user",
      targetId,
      action: "user.set_admin",
      after: { isAdmin },
    },
    signal,
  );
}

export async function setUserActive(
  db: Db,
  actor: PermSetUser,
  input: { userId: string; isActive: boolean },
  signal: AbortSignal,
): Promise<Result<true, string>> {
  // Deactivation: same last-admin lockout race as demotion (F6). Lock active-admin rows
  // FOR UPDATE, re-check the count, then flip is_active and revoke sessions, all atomic.
  if (input.isActive === false) {
    signal.throwIfAborted();
    const result = await db.transaction(async (tx): Promise<Result<true, string>> => {
      const locked = await tx.execute(
        sql`SELECT id FROM users WHERE is_admin = true AND is_active = true FOR UPDATE`,
      );
      const [target] = await tx
        .select({ isAdmin: users.isAdmin })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (target === undefined) return err("not_found");
      const gate = canDeactivateUser(actor, {
        targetUserId: input.userId,
        targetIsAdmin: target.isAdmin,
        activeAdminCount: locked.rows.length,
      });
      if (gate.ok === false) return gate;
      await tx.update(users).set({ isActive: false }).where(eq(users.id, input.userId));
      await tx
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, input.userId), isNull(sessions.revokedAt)));
      return ok(true);
    });
    if (result.ok === false) return result;
    await recordAudit(
      db,
      { actorId: actor.id, targetType: "user", targetId: input.userId, action: "user.deactivate" },
      signal,
    );
    return ok(true);
  }

  if (actor.type !== "admin") return err("admin required to reactivate users");
  signal.throwIfAborted();
  await db.update(users).set({ isActive: true }).where(eq(users.id, input.userId));
  await recordAudit(
    db,
    { actorId: actor.id, targetType: "user", targetId: input.userId, action: "user.activate" },
    signal,
  );
  return ok(true);
}
