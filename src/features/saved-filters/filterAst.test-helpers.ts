import type { PermissionFlagKey } from "@/constants/permissionFlags";
import type { CreateDealSession } from "@/features/deals/dealActions";
import type { PermSetUser } from "@/features/permissions/effective";
import type { DealVisibilitySession } from "@/types/session";

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

export function adminPermSession(userId: string): PermSetUser {
  return {
    id: userId,
    type: "admin",
    isActive: true,
    groupIds: new Set<string>(),
    flags: new Set<PermissionFlagKey>(),
  };
}

export function visSession(userId: string): DealVisibilitySession {
  return {
    userId,
    isAdmin: true,
    isActive: true,
    sessionLive: true,
    visibilityGroupIds: [],
  };
}

export function regularVisSession(userId: string): DealVisibilitySession {
  return {
    userId,
    isAdmin: false,
    isActive: true,
    sessionLive: true,
    visibilityGroupIds: [],
  };
}

export function filterSessionWithFlag(
  userId: string,
  flag: string,
): { userId: string; isAdmin: boolean; flags: Record<string, boolean> } {
  return { userId, isAdmin: false, flags: { [flag]: true } };
}

export function filterSessionNoFlag(userId: string): {
  userId: string;
  isAdmin: boolean;
  flags: Record<string, boolean>;
} {
  return { userId, isAdmin: false, flags: {} };
}

export function filterSessionAdmin(userId: string): {
  userId: string;
  isAdmin: boolean;
  flags: Record<string, boolean>;
} {
  return { userId, isAdmin: true, flags: {} };
}
