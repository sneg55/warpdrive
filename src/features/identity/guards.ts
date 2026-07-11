import { HIGH_RISK_FLAGS, type PermissionFlagKey } from "@/constants/permissionFlags";
import type { PermSetUser } from "@/features/permissions/effective";
import { err, ok, type Result } from "@/types/result";

const highRisk = new Set<string>(HIGH_RISK_FLAGS);

function requireManage(actor: PermSetUser): Result<true, string> {
  if (actor.type === "admin") return ok(true);
  if (actor.flags.has("permissions.manage")) return ok(true);
  return err("permissions.manage required");
}

// A non-admin manager cannot edit a set currently assigned to themselves.
export function canEditPermissionSet(
  actor: PermSetUser,
  args: { setId: string; actorOwnSetId: string | null },
): Result<true, string> {
  const gate = requireManage(actor);
  if (!gate.ok) return gate;
  if (actor.type === "admin") return ok(true);
  if (args.actorOwnSetId !== null && args.setId === args.actorOwnSetId) {
    return err("cannot edit your own permission set");
  }
  return ok(true);
}

// Granting any high-risk flag requires admin, not merely permissions.manage.
export function canGrantFlags(
  actor: PermSetUser,
  flagsBeingEnabled: PermissionFlagKey[],
): Result<true, string> {
  const gate = requireManage(actor);
  if (!gate.ok) return gate;
  if (actor.type === "admin") return ok(true);
  for (const f of flagsBeingEnabled) {
    if (highRisk.has(f)) return err(`granting ${f} requires admin`);
  }
  return ok(true);
}

// A manager cannot reassign their own permission set.
export function canAssignPermissionSet(
  actor: PermSetUser,
  args: { targetUserId: string },
): Result<true, string> {
  const gate = requireManage(actor);
  if (!gate.ok) return gate;
  if (actor.type === "admin") return ok(true);
  if (args.targetUserId === actor.id) return err("cannot reassign your own permission set");
  return ok(true);
}

// A non-admin manager may manage membership only of groups they do NOT belong to,
// that gate no restricted pipeline, and never their own membership (self-escalation).
export function canManageGroupMembership(
  actor: PermSetUser,
  args: {
    groupId: string;
    targetUserId: string;
    groupGatesRestrictedPipeline: boolean;
    actorIsMemberOfGroup: boolean;
  },
): Result<true, string> {
  const gate = requireManage(actor);
  if (!gate.ok) return gate;
  if (actor.type === "admin") return ok(true);
  if (args.targetUserId === actor.id) return err("cannot change your own group membership");
  if (args.actorIsMemberOfGroup) return err("cannot manage a group you belong to");
  if (args.groupGatesRestrictedPipeline)
    return err("cannot manage a group gating a restricted pipeline");
  return ok(true);
}

// Assigning/clearing is_admin is admin-only (permissions.manage does NOT include it).
export function canToggleAdminRole(actor: PermSetUser): Result<true, string> {
  if (actor.type === "admin") return ok(true);
  return err("admin required to change admin role");
}

// Cannot self-deactivate; the last active admin cannot be deactivated (prevents lockout).
export function canDeactivateUser(
  actor: PermSetUser,
  args: { targetUserId: string; targetIsAdmin: boolean; activeAdminCount: number },
): Result<true, string> {
  if (actor.type !== "admin") return err("admin required to deactivate users");
  if (args.targetUserId === actor.id) return err("cannot deactivate yourself");
  if (args.targetIsAdmin && args.activeAdminCount <= 1)
    return err("cannot deactivate the last active admin");
  return ok(true);
}

// Demoting the last active admin to non-admin orphans the instance (same lockout risk as
// deactivating them). Only block when the target is currently admin AND would be demoted.
export function canDemoteAdmin(args: {
  targetIsAdmin: boolean;
  isDemotion: boolean;
  activeAdminCount: number;
}): Result<true, string> {
  if (!args.isDemotion || !args.targetIsAdmin) return ok(true);
  if (args.activeAdminCount <= 1) return err("cannot demote the last active admin");
  return ok(true);
}
