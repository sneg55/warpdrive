import type { PermissionFlagKey } from "@/constants/permissionFlags";
import type { AuthUser } from "./types";

export interface PermSetUser extends AuthUser {
  // The flat set of TRUE flags from the user's single assigned permission set.
  flags: ReadonlySet<PermissionFlagKey>;
}

// No layering in Phase 1: one user, one set, one map (permissions spec 5.3).
export function effectivePermissions(user: PermSetUser): ReadonlySet<PermissionFlagKey> {
  return user.flags;
}
