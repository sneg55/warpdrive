import type { PermissionFlagKey } from "@/constants/permissionFlags";

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

const RECORD_SCOPED_ONLY = ["activity.complete"] as const;

type GlobalAction =
  | "deal.create"
  | "contact.create"
  | "activity.create"
  | "bulk.edit"
  | "data.import"
  | "data.export"
  | "filter.share"
  | "stats.viewOthers"
  | "pipeline.manage"
  | "metadata.manage"
  | "goals.manage"
  | "permissions.manage";

export type OwnershipAction = (typeof OWNERSHIP_ACTIONS)[number];
export type Action = OwnershipAction | (typeof RECORD_SCOPED_ONLY)[number] | GlobalAction;

const TEAM_SCOPED_ACTIONS = [
  "deal.edit",
  "contact.edit",
  "activity.edit",
  "deal.changeOwner",
] as const;

const teamScopedSet = new Set<string>(TEAM_SCOPED_ACTIONS);
const ownershipSet = new Set<string>(OWNERSHIP_ACTIONS);
const recordScopedSet = new Set<string>([...OWNERSHIP_ACTIONS, ...RECORD_SCOPED_ONLY]);

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

export function isTeamScoped(action: OwnershipAction): boolean {
  return teamScopedSet.has(action);
}

export function teamVariant(action: OwnershipAction): PermissionFlagKey {
  return `${action}_team` as PermissionFlagKey;
}
