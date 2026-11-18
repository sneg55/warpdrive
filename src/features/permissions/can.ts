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

function canOwnershipAction(
  user: PermSetUser,
  action: OwnershipAction,
  record: VisibleRecord | undefined,
  perms: ReadonlySet<string>,
): boolean {
  if (perms.has(anyVariant(action))) return true;
  if (perms.has(ownVariant(action))) {
    return record !== undefined && record.ownerId === user.id;
  }
  if (isTeamScoped(action) && perms.has(teamVariant(action))) {
    return record !== undefined && managesOwner(user, record.ownerId);
  }
  return false;
}

export function can(user: PermSetUser, action: Action, record?: VisibleRecord): boolean {
  if (!user.isActive) return false;

  if (user.type === "admin") return true;

  if (isRecordScoped(action)) {
    if (record === undefined) return false;
    if (!canSee(user, record)) return false;
  }

  if (
    (action === "activity.edit" || action === "activity.complete") &&
    record?.kind === "activity" &&
    record.assigneeId === user.id
  ) {
    return true;
  }

  const perms = effectivePermissions(user);

  if (isOwnershipScoped(action)) {
    return canOwnershipAction(user, action, record, perms);
  }

  return perms.has(action as never);
}
