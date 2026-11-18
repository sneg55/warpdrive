import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { settings } from "@/db/schema/system";
import type { withTestDb } from "@/db/testing";
import type { PermSetUser } from "@/features/permissions/effective";

type Db = Parameters<Parameters<typeof withTestDb>[0]>[0];

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

export function ownerOnly(userId: string) {
  return {
    userId,
    isAdmin: false,
    isActive: true,
    sessionLive: true,
    visibilityGroupIds: [] as string[],
    primaryVisibilityGroupId: null as string | null,
    flags: { "deal.create": true } as Record<string, boolean>,
  };
}

export function adminActor(userId: string): PermSetUser {
  return {
    id: userId,
    type: "admin",
    isActive: true,
    groupIds: new Set<string>(),
    flags: new Set<PermissionFlagKey>(),
  };
}

export function bulkEditorAny(userId: string): PermSetUser {
  return {
    id: userId,
    type: "regular",
    isActive: true,
    groupIds: new Set<string>(),
    flags: new Set<PermissionFlagKey>(["bulk.edit", "deal.edit_any"]),
  };
}

export function bulkEditorNoEdit(userId: string): PermSetUser {
  return {
    id: userId,
    type: "regular",
    isActive: true,
    groupIds: new Set<string>(),
    flags: new Set<PermissionFlagKey>(["bulk.edit"]),
  };
}

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
