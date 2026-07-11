import { describe, expect, test } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import type { PermSetUser } from "@/features/permissions/effective";
import {
  canAssignPermissionSet,
  canDeactivateUser,
  canEditPermissionSet,
  canGrantFlags,
  canManageGroupMembership,
  canToggleAdminRole,
} from "./guards";

function actor(type: "admin" | "regular", flags: PermissionFlagKey[] = []): PermSetUser {
  return { id: "actor", type, isActive: true, groupIds: new Set(), flags: new Set(flags) };
}
const mgr = () => actor("regular", ["permissions.manage"]);

describe("identity self-escalation guards (permissions spec 5.2)", () => {
  test("non-admin manager cannot edit a set assigned to themselves", () => {
    const r = canEditPermissionSet(mgr(), { setId: "ps1", actorOwnSetId: "ps1" });
    expect(r.ok).toBe(false);
  });
  test("non-admin manager can edit a set not assigned to themselves", () => {
    const r = canEditPermissionSet(mgr(), { setId: "ps2", actorOwnSetId: "ps1" });
    expect(r.ok).toBe(true);
  });
  test("granting a high-risk flag requires admin", () => {
    expect(canGrantFlags(mgr(), ["permissions.manage"]).ok).toBe(false);
    expect(canGrantFlags(mgr(), ["data.export"]).ok).toBe(false);
    expect(canGrantFlags(actor("admin"), ["permissions.manage"]).ok).toBe(true);
  });
  test("low-risk flag grant allowed for a manager", () => {
    expect(canGrantFlags(mgr(), ["deal.create"]).ok).toBe(true);
  });
  test("manager cannot reassign their OWN permission set", () => {
    expect(canAssignPermissionSet(mgr(), { targetUserId: "actor" }).ok).toBe(false);
    expect(canAssignPermissionSet(mgr(), { targetUserId: "other" }).ok).toBe(true);
  });
  test("manager cannot add themselves to a group, nor manage a group they belong to", () => {
    expect(
      canManageGroupMembership(mgr(), {
        groupId: "g",
        targetUserId: "actor",
        groupGatesRestrictedPipeline: false,
        actorIsMemberOfGroup: false,
      }).ok,
    ).toBe(false);
    expect(
      canManageGroupMembership(mgr(), {
        groupId: "g",
        targetUserId: "other",
        groupGatesRestrictedPipeline: false,
        actorIsMemberOfGroup: true,
      }).ok,
    ).toBe(false);
    expect(
      canManageGroupMembership(mgr(), {
        groupId: "g",
        targetUserId: "other",
        groupGatesRestrictedPipeline: true,
        actorIsMemberOfGroup: false,
      }).ok,
    ).toBe(false);
    expect(
      canManageGroupMembership(mgr(), {
        groupId: "g",
        targetUserId: "other",
        groupGatesRestrictedPipeline: false,
        actorIsMemberOfGroup: false,
      }).ok,
    ).toBe(true);
  });
  test("toggling admin role is admin-only", () => {
    expect(canToggleAdminRole(mgr()).ok).toBe(false);
    expect(canToggleAdminRole(actor("admin")).ok).toBe(true);
  });
  test("cannot self-deactivate; last active admin protected", () => {
    expect(
      canDeactivateUser(actor("admin"), {
        targetUserId: "actor",
        targetIsAdmin: true,
        activeAdminCount: 2,
      }).ok,
    ).toBe(false);
    expect(
      canDeactivateUser(actor("admin"), {
        targetUserId: "other",
        targetIsAdmin: true,
        activeAdminCount: 1,
      }).ok,
    ).toBe(false);
    expect(
      canDeactivateUser(actor("admin"), {
        targetUserId: "other",
        targetIsAdmin: true,
        activeAdminCount: 2,
      }).ok,
    ).toBe(true);
    expect(
      canDeactivateUser(mgr(), { targetUserId: "other", targetIsAdmin: false, activeAdminCount: 2 })
        .ok,
    ).toBe(false); // not admin
  });
});
