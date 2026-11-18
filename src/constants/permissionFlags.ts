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
  "goals.manage",
  "permissions.manage",
  "team.viewMembers",
] as const;

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

export const TEAM_SCOPED_FLAGS = [
  "deal.edit",
  "contact.edit",
  "activity.edit",
  "deal.changeOwner",
] as const;

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

export const PERMISSION_FLAGS = {
  MANAGE: "permissions.manage",
  METADATA_MANAGE: "metadata.manage",
  PIPELINE_MANAGE: "pipeline.manage",
} as const satisfies Record<string, PermissionFlagKey>;

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

export const ADMIN_DEFAULT_FLAGS: Record<PermissionFlagKey, boolean> = buildFlags(() => true);

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
