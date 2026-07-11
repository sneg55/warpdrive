// Shared session factories for saved-filters tests.
// Each function returns the exact session shape required by the callee.
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import type { CreateDealSession } from "@/features/deals/dealActions";
import type { PermSetUser } from "@/features/permissions/effective";
import type { DealVisibilitySession } from "@/types/session";

// Session for createDeal (CreateDealSession shape).
export function createSession(userId: string): CreateDealSession {
  return {
    userId,
    isAdmin: true,
    isActive: true,
    sessionLive: true,
    visibilityGroupIds: [],
    primaryVisibilityGroupId: null,
    flags: { "deal.create": true },
  };
}

// Session for updateDeal (PermSetUser shape, admin bypass).
export function adminPermSession(userId: string): PermSetUser {
  return {
    id: userId,
    type: "admin",
    isActive: true,
    groupIds: new Set<string>(),
    flags: new Set<PermissionFlagKey>(),
  };
}

// Session for dealVisibilityClause: admin sees everything.
export function visSession(userId: string): DealVisibilitySession {
  return {
    userId,
    isAdmin: true,
    isActive: true,
    sessionLive: true,
    visibilityGroupIds: [],
  };
}

// Session for dealVisibilityClause: regular user with no groups.
export function regularVisSession(userId: string): DealVisibilitySession {
  return {
    userId,
    isAdmin: false,
    isActive: true,
    sessionLive: true,
    visibilityGroupIds: [],
  };
}

// FilterSession with a specific flag (for saveFilter/listSavedFilters).
export function filterSessionWithFlag(
  userId: string,
  flag: string,
): { userId: string; isAdmin: boolean; flags: Record<string, boolean> } {
  return { userId, isAdmin: false, flags: { [flag]: true } };
}

// FilterSession with no flags.
export function filterSessionNoFlag(userId: string): {
  userId: string;
  isAdmin: boolean;
  flags: Record<string, boolean>;
} {
  return { userId, isAdmin: false, flags: {} };
}

// FilterSession with admin=true (bypasses flag check).
export function filterSessionAdmin(userId: string): {
  userId: string;
  isAdmin: boolean;
  flags: Record<string, boolean>;
} {
  return { userId, isAdmin: true, flags: {} };
}
