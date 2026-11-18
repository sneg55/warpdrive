import type { VisibilityLevel } from "@/constants/visibility";

export interface AuthUser {
  id: string;
  type: "admin" | "regular";
  isActive: boolean;
  groupIds: ReadonlySet<string>;
  managedUserIds?: ReadonlySet<string>;
}

const NO_MANAGED_USERS: ReadonlySet<string> = new Set();

export function managesOwner(user: AuthUser, ownerId: string | null): boolean {
  if (ownerId === null) return false;
  return (user.managedUserIds ?? NO_MANAGED_USERS).has(ownerId);
}

interface VisibleBase {
  ownerId: string | null;
  visibilityLevel: VisibilityLevel;
  visibilityGroupId: string | null;
  visibleToUserIds: readonly string[];
}

export interface VisibleDeal extends VisibleBase {
  kind: "deal";
  pipelineVisibilityGroupId: string | null;
}

export interface VisiblePersonOrOrg extends VisibleBase {
  kind: "person" | "organization";
}

export interface VisibleActivity extends VisibleBase {
  kind: "activity";
  assigneeId: string;
  pipelineVisibilityGroupId: string | null;
}

export type VisibleRecord = VisibleDeal | VisiblePersonOrOrg | VisibleActivity;

export function isMemberOfGroup(user: AuthUser, groupId: string | null): boolean {
  if (groupId === null) return false;
  return user.groupIds.has(groupId);
}
