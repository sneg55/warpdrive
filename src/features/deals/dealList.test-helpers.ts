// Shared test fixtures for dealList.test.ts and dealBulk.test.ts.
// Not production code; helpers only.
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { settings } from "@/db/schema/system";
import type { withTestDb } from "@/db/testing";
import type { PermSetUser } from "@/features/permissions/effective";

type Db = Parameters<Parameters<typeof withTestDb>[0]>[0];

// DealVisibilitySession-shaped (used by createDeal + listDeals). Admin: sees all.
export function admin(userId: string) {
  return {
    userId,
    isAdmin: true,
    isActive: true,
    sessionLive: true,
    visibilityGroupIds: [] as string[],
    primaryVisibilityGroupId: null as string | null,
    flags: { "bulk.edit": true } as Record<string, boolean>,
  };
}

// Non-admin, owner-only visibility, no bulk.edit (for createDeal / listDeals).
export function ownerOnly(userId: string) {
  return {
    userId,
    isAdmin: false,
    isActive: true,
    sessionLive: true,
    visibilityGroupIds: [] as string[],
    primaryVisibilityGroupId: null as string | null,
    // deal.create so this session can seed deals via createDeal (its capability gate);
    // these helpers exercise owner-level VISIBILITY, not the create capability itself.
    flags: { "deal.create": true } as Record<string, boolean>,
  };
}

// Canonical PermSetUser builders for bulkUpdateStage (same shape move/update use).
export function adminActor(userId: string): PermSetUser {
  return {
    id: userId,
    type: "admin",
    isActive: true,
    groupIds: new Set<string>(),
    flags: new Set<PermissionFlagKey>(),
  };
}

// Regular actor with bulk.edit; deal.edit_any so any visible deal is editable.
export function bulkEditorAny(userId: string): PermSetUser {
  return {
    id: userId,
    type: "regular",
    isActive: true,
    groupIds: new Set<string>(),
    flags: new Set<PermissionFlagKey>(["bulk.edit", "deal.edit_any"]),
  };
}

// Regular actor with bulk.edit but NO deal.edit flag (cannot edit others' deals).
export function bulkEditorNoEdit(userId: string): PermSetUser {
  return {
    id: userId,
    type: "regular",
    isActive: true,
    groupIds: new Set<string>(),
    flags: new Set<PermissionFlagKey>(["bulk.edit"]),
  };
}

// Regular actor with NO bulk.edit at all (has deal.edit_any to prove the gate is independent).
export function noBulk(userId: string): PermSetUser {
  return {
    id: userId,
    type: "regular",
    isActive: true,
    groupIds: new Set<string>(),
    flags: new Set<PermissionFlagKey>(["deal.edit_any"]),
  };
}

export async function seedAllVisible(db: Db) {
  await db.insert(settings).values({
    id: true,
    baseCurrency: "USD",
    defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
  });
}

export async function seedOwnerOnly(db: Db) {
  await db.insert(settings).values({
    id: true,
    baseCurrency: "USD",
    defaultVisibilityLevels: { deal: "owner", person: "all", organization: "all" },
  });
}
