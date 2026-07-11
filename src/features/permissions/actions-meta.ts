import type { PermissionFlagKey } from "@/constants/permissionFlags";

// Ownership-scoped actions (always also record-scoped). The stored flags are _own/_any pairs.
const OWNERSHIP_ACTIONS = [
  "deal.edit",
  "deal.delete",
  "deal.changeOwner",
  "contact.edit",
  "contact.delete",
  "contact.merge",
  "activity.edit",
  "activity.delete",
  "record.share",
] as const;

// Record-scoped but NOT ownership-scoped: still requires canSee, flag is unscoped.
// activity.complete is record-scoped and gated by the assignee exception or activity.edit flags.
const RECORD_SCOPED_ONLY = ["activity.complete"] as const;

const GLOBAL_ACTIONS = [
  "deal.create",
  "contact.create",
  "activity.create",
  "bulk.edit",
  "data.import",
  "data.export",
  "filter.share",
  "stats.viewOthers",
  "pipeline.manage",
  "metadata.manage",
  "permissions.manage",
] as const;

export type OwnershipAction = (typeof OWNERSHIP_ACTIONS)[number];
export type Action =
  | OwnershipAction
  | (typeof RECORD_SCOPED_ONLY)[number]
  | (typeof GLOBAL_ACTIONS)[number];

// Team-scoped subset: actions a team manager may perform on a managed member's record (a _team
// flag variant). Mirrors TEAM_SCOPED_FLAGS; excludes delete/merge/share by design.
const TEAM_SCOPED_ACTIONS = [
  "deal.edit",
  "contact.edit",
  "activity.edit",
  "deal.changeOwner",
] as const;

const teamScopedSet = new Set<string>(TEAM_SCOPED_ACTIONS);
const ownershipSet = new Set<string>(OWNERSHIP_ACTIONS);
const recordScopedSet = new Set<string>([...OWNERSHIP_ACTIONS, ...RECORD_SCOPED_ONLY]);
// Used at runtime to validate action strings against the known global action set.
export const globalActionSet = new Set<string>(GLOBAL_ACTIONS);

export function isOwnershipScoped(action: Action): action is OwnershipAction {
  return ownershipSet.has(action);
}

export function isRecordScoped(action: Action): boolean {
  return recordScopedSet.has(action);
}

export function ownVariant(action: OwnershipAction): PermissionFlagKey {
  return `${action}_own` as PermissionFlagKey;
}

export function anyVariant(action: OwnershipAction): PermissionFlagKey {
  return `${action}_any` as PermissionFlagKey;
}

// True for the ownership actions that also have a team-scoped (_team) variant.
export function isTeamScoped(action: OwnershipAction): boolean {
  return teamScopedSet.has(action);
}

export function teamVariant(action: OwnershipAction): PermissionFlagKey {
  return `${action}_team` as PermissionFlagKey;
}
