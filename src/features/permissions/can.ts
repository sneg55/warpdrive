import {
  type Action,
  anyVariant,
  isOwnershipScoped,
  isRecordScoped,
  isTeamScoped,
  type OwnershipAction,
  ownVariant,
  teamVariant,
} from "./actions-meta";
import { canSee } from "./canSee";
import { effectivePermissions, type PermSetUser } from "./effective";
import { managesOwner, type VisibleRecord } from "./types";

// Ownership-scoped resolution (spec 3.3, rules 4b/4c). _any grants unconditionally; _own requires
// ownership; _team lets a manager act on a managed member's already-visible record.
function canOwnershipAction(
  user: PermSetUser,
  action: OwnershipAction,
  record: VisibleRecord | undefined,
  perms: ReadonlySet<string>,
): boolean {
  if (perms.has(anyVariant(action))) return true;
  if (perms.has(ownVariant(action))) {
    // record is guaranteed non-null: ownership actions are record-scoped (rule 2 in can()).
    return record !== undefined && record.ownerId === user.id;
  }
  if (isTeamScoped(action) && perms.has(teamVariant(action))) {
    return record !== undefined && managesOwner(user, record.ownerId);
  }
  return false;
}

// Mirror of permissions spec 3.3, ordered. Fails closed.
export function can(user: PermSetUser, action: Action, record?: VisibleRecord): boolean {
  if (!user.isActive) return false; // 0: inactive denies all

  if (user.type === "admin") return true; // 1: admin bypass

  if (isRecordScoped(action)) {
    // 2: record-scoped requires a visible record (fail closed)
    if (record === undefined) return false;
    if (!canSee(user, record)) return false;
  }

  // 4a: Activity assignee exception: edit/complete only (delete stays owner/admin-gated).
  // Kind guard is required: assigneeId only exists on VisibleActivity records.
  if (
    (action === "activity.edit" || action === "activity.complete") &&
    record?.kind === "activity" &&
    record.assigneeId === user.id
  ) {
    return true;
  }

  const perms = effectivePermissions(user); // 3: resolve effective flags

  // 4b/4c: ownership-scoped (own/any/team), extracted to keep this function simple.
  if (isOwnershipScoped(action)) {
    return canOwnershipAction(user, action, record, perms);
  }

  // 5: global flag check
  return perms.has(action as never);
}
