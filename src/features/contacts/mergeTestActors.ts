import type { PermissionFlagKey } from "@/constants/permissionFlags";
import type { PermSetUser } from "@/features/permissions/effective";
import type { ContactActor } from "./personsRepo";

export type MergeActor = ContactActor & PermSetUser;

export function adminActor(id: string): MergeActor {
  return {
    id,
    type: "admin",
    isActive: true,
    groupIds: new Set<string>(),
    primaryVisibilityGroupId: null,
    flags: new Set<PermissionFlagKey>(),
  };
}

export function regularActor(id: string): MergeActor {
  return {
    id,
    type: "regular",
    isActive: true,
    groupIds: new Set<string>(),
    primaryVisibilityGroupId: null,
    flags: new Set<PermissionFlagKey>(),
  };
}
