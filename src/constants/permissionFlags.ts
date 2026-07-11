// Global (unscoped) flags: stored under their own name.
export const GLOBAL_FLAGS = [
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
  // Team-manager visibility: the set holder can SEE records owned by members of any team they
  // manage (teams.managerId), across entities. Inert unless the holder actually manages a team.
  "team.viewMembers",
] as const;

// Ownership-scoped capabilities: stored as _own/_any PAIRS. _any implies _own.
export const OWNERSHIP_FLAGS = [
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

// Team-scoped capabilities: stored as a _team variant. The set holder may perform the action on
// records owned by members of a team they MANAGE (not their own, not everyone's). A subset of the
// ownership capabilities, deliberately excluding delete/merge/share (higher risk, admin-only).
export const TEAM_SCOPED_FLAGS = [
  "deal.edit",
  "contact.edit",
  "activity.edit",
  "deal.changeOwner",
] as const;

export type GlobalFlag = (typeof GLOBAL_FLAGS)[number];
export type OwnershipCapability = (typeof OWNERSHIP_FLAGS)[number];
export type TeamScopedCapability = (typeof TEAM_SCOPED_FLAGS)[number];

const ownershipFlagKeys = OWNERSHIP_FLAGS.flatMap((cap) => [`${cap}_own`, `${cap}_any`] as const);
const teamFlagKeys = TEAM_SCOPED_FLAGS.map((cap) => `${cap}_team` as const);

export const ALL_PERMISSION_FLAG_KEYS = [
  ...GLOBAL_FLAGS,
  ...ownershipFlagKeys,
  ...teamFlagKeys,
] as const;

export type PermissionFlagKey = (typeof ALL_PERMISSION_FLAG_KEYS)[number];

// Named references for individual flags so a rename cannot silently break a check.
export const PERMISSION_FLAGS = {
  MANAGE: "permissions.manage",
  METADATA_MANAGE: "metadata.manage",
  PIPELINE_MANAGE: "pipeline.manage",
} as const satisfies Record<string, PermissionFlagKey>;

// Granting any of these to a set requires the actor to be an admin (permissions spec 5.2).
export const HIGH_RISK_FLAGS = [
  "permissions.manage",
  "pipeline.manage",
  "metadata.manage",
  "data.export",
  "data.import",
  "record.share_any",
] as const satisfies readonly PermissionFlagKey[];

function buildFlags(
  predicate: (key: PermissionFlagKey) => boolean,
): Record<PermissionFlagKey, boolean> {
  const out = {} as Record<PermissionFlagKey, boolean>;
  for (const key of ALL_PERMISSION_FLAG_KEYS) out[key] = predicate(key);
  return out;
}

// Admin set ignores flags at runtime, but a stored admin set has all true for clarity.
export const ADMIN_DEFAULT_FLAGS: Record<PermissionFlagKey, boolean> = buildFlags(() => true);

// Regular: create yes; edit own yes; delete/any/import/export/manage no (permissions spec 5.2).
const REGULAR_TRUE = new Set<PermissionFlagKey>([
  "deal.create",
  "contact.create",
  "activity.create",
  "deal.edit_own",
  "contact.edit_own",
  "activity.edit_own",
  "record.share_own",
]);

export const REGULAR_DEFAULT_FLAGS: Record<PermissionFlagKey, boolean> = buildFlags((key) =>
  REGULAR_TRUE.has(key),
);
