import type { PermissionFlagKey } from "@/constants/permissionFlags";
import type { AuthUser } from "./types";

export interface PermSetUser extends AuthUser {
  flags: ReadonlySet<PermissionFlagKey>;
}

export function effectivePermissions(user: PermSetUser): ReadonlySet<PermissionFlagKey> {
  return user.flags;
}
