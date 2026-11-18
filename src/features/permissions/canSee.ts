import { assertNever } from "@/types/result";
import { type AuthUser, isMemberOfGroup, managesOwner, type VisibleRecord } from "./types";

export function canSee(user: AuthUser, record: VisibleRecord): boolean {
  if (!user.isActive) return false;

  if (user.type === "admin") return true;

  if (
    (record.kind === "deal" || record.kind === "activity") &&
    record.pipelineVisibilityGroupId !== null
  ) {
    if (!isMemberOfGroup(user, record.pipelineVisibilityGroupId)) return false;
  }

  if (record.visibleToUserIds.includes(user.id)) return true;

  if (record.ownerId !== null && record.ownerId === user.id) return true;

  if (managesOwner(user, record.ownerId)) return true;

  switch (record.visibilityLevel) {
    case "all":
      return true;
    case "group":
      return isMemberOfGroup(user, record.visibilityGroupId);
    case "owner":
      return false;
    default:
      return assertNever(record.visibilityLevel);
  }
}
