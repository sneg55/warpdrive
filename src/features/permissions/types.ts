import type { VisibilityLevel } from "@/constants/visibility";

export interface AuthUser {
  id: string;
  type: "admin" | "regular";
  isActive: boolean;
  groupIds: ReadonlySet<string>;
  // Users on teams this actor MANAGES (teams.managerId), populated at hydration ONLY when the
  // actor holds team.viewMembers. So membership here already encodes the team-view grant: a manager
  // may see (and, with the matching _team flag, act on) records owned by these users. Absent/empty
  // for non-managers and managers without the flag (fail-closed default).
  managedUserIds?: ReadonlySet<string>;
}

const NO_MANAGED_USERS: ReadonlySet<string> = new Set();

// Owner-of-record is one of this actor's managed team members (fail-closed when unset or ownerless).
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
  // Pulled from the deal's pipeline (data-model: restriction lives on pipelines, not deals).
  pipelineVisibilityGroupId: string | null;
}

export interface VisiblePersonOrOrg extends VisibleBase {
  kind: "person" | "organization";
}

export interface VisibleActivity extends VisibleBase {
  kind: "activity";
  assigneeId: string;
  // Set when the dominant parent is a deal (carries the pipeline restriction gate).
  pipelineVisibilityGroupId: string | null;
}

export type VisibleRecord = VisibleDeal | VisiblePersonOrOrg | VisibleActivity;

// Direct membership only (no nesting in Phase 1, permissions spec 4.4).
export function isMemberOfGroup(user: AuthUser, groupId: string | null): boolean {
  if (groupId === null) return false;
  return user.groupIds.has(groupId);
}
