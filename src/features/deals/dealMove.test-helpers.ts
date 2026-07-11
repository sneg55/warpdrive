// Shared test fixtures for dealMove.test.ts and dealMovePerms.test.ts.
// Not production code; helpers only.
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { settings } from "@/db/schema/system";
import type { withTestDb } from "@/db/testing";
import type { PermSetUser } from "@/features/permissions/effective";

type Db = Parameters<Parameters<typeof withTestDb>[0]>[0];

export function adminSession(userId: string): PermSetUser {
  return {
    id: userId,
    type: "admin",
    isActive: true,
    groupIds: new Set<string>(),
    flags: new Set<PermissionFlagKey>(),
  };
}

export function regularSession(userId: string): PermSetUser {
  return {
    id: userId,
    type: "regular",
    isActive: true,
    groupIds: new Set<string>(),
    // deal.edit_own lets the owner move their own deals
    flags: new Set<PermissionFlagKey>(["deal.edit_own"]),
  };
}

export function noEditSession(userId: string): PermSetUser {
  return {
    id: userId,
    type: "regular",
    isActive: true,
    groupIds: new Set<string>(),
    flags: new Set<PermissionFlagKey>(), // no deal.edit_* flags
  };
}

// Session shape for createDeal (uses CreateDealSession, not PermSetUser).
export function createSession(userId: string) {
  return {
    userId,
    isAdmin: true,
    isActive: true,
    sessionLive: true,
    visibilityGroupIds: [] as string[],
    primaryVisibilityGroupId: null as string | null,
    flags: { "deal.create": true } as Record<string, boolean>,
  };
}

export async function seedSettings(db: Db, dealLevel: "all" | "owner" | "group" = "all") {
  await db.insert(settings).values({
    id: true,
    baseCurrency: "USD",
    defaultVisibilityLevels: { deal: dealLevel, person: "all", organization: "all" },
  });
}
