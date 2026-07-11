import { eq } from "drizzle-orm";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import type { Db } from "@/db/client";
import { permissionSets, users } from "@/db/schema";
import type { PermSetUser } from "@/features/permissions/effective";
import { err, ok, type Result } from "@/types/result";
import { recordAudit } from "./audit";
import { canEditPermissionSet, canGrantFlags } from "./guards";

export function listPermissionSets(db: Db, signal: AbortSignal) {
  signal.throwIfAborted();
  return db.select().from(permissionSets);
}

export async function createPermissionSet(
  db: Db,
  actor: PermSetUser,
  input: { name: string; flags: Partial<Record<PermissionFlagKey, boolean>> },
  signal: AbortSignal,
): Promise<Result<{ id: string }, string>> {
  const enabled = Object.entries(input.flags)
    .filter(([, v]) => v === true)
    .map(([k]) => k as PermissionFlagKey);
  const grant = canGrantFlags(actor, enabled);
  if (grant.ok === false) return grant;
  signal.throwIfAborted();
  const [row] = await db
    .insert(permissionSets)
    .values({ name: input.name, flags: input.flags })
    .returning();
  if (row === undefined) return err("create failed");
  await recordAudit(
    db,
    {
      actorId: actor.id,
      targetType: "permission_set",
      targetId: row.id,
      action: "permission_set.create",
      after: { name: input.name, flags: input.flags },
    },
    signal,
  );
  return ok({ id: row.id });
}

export async function updatePermissionSetFlags(
  db: Db,
  actor: PermSetUser,
  input: { setId: string; flags: Partial<Record<PermissionFlagKey, boolean>> },
  signal: AbortSignal,
): Promise<Result<true, string>> {
  // Resolve the actor's own set id to block self-set edits.
  const [me] = await db
    .select({ setId: users.permissionSetId })
    .from(users)
    .where(eq(users.id, actor.id))
    .limit(1);
  const editGate = canEditPermissionSet(actor, {
    setId: input.setId,
    actorOwnSetId: me?.setId ?? null,
  });
  if (editGate.ok === false) return editGate;
  const enabled = Object.entries(input.flags)
    .filter(([, v]) => v === true)
    .map(([k]) => k as PermissionFlagKey);
  const grant = canGrantFlags(actor, enabled);
  if (grant.ok === false) return grant;
  signal.throwIfAborted();
  const [before] = await db
    .select()
    .from(permissionSets)
    .where(eq(permissionSets.id, input.setId))
    .limit(1);
  if (before === undefined) return err("not_found");
  await db
    .update(permissionSets)
    .set({ flags: input.flags })
    .where(eq(permissionSets.id, input.setId));
  await recordAudit(
    db,
    {
      actorId: actor.id,
      targetType: "permission_set",
      targetId: input.setId,
      action: "permission_set.update",
      before: { flags: before.flags },
      after: { flags: input.flags },
    },
    signal,
  );
  return ok(true);
}
