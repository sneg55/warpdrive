import { describe, expect, test } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { can } from "./can";
import type { PermSetUser } from "./effective";
import type { VisibleActivity, VisibleDeal } from "./types";

const OWNER = "owner";
const VIEWER = "viewer";

function u(
  type: "admin" | "regular",
  flags: PermissionFlagKey[],
  over: Partial<PermSetUser> = {},
): PermSetUser {
  return { id: VIEWER, type, isActive: true, groupIds: new Set(), flags: new Set(flags), ...over };
}
function visibleDeal(ownerId: string | null = VIEWER): VisibleDeal {
  return {
    kind: "deal",
    ownerId,
    visibilityLevel: "all",
    visibilityGroupId: null,
    visibleToUserIds: [],
    pipelineVisibilityGroupId: null,
  };
}
function invisibleDeal(): VisibleDeal {
  return {
    kind: "deal",
    ownerId: OWNER,
    visibilityLevel: "owner",
    visibilityGroupId: null,
    visibleToUserIds: [],
    pipelineVisibilityGroupId: null,
  };
}
// A parentless activity visible to VIEWER (assignee = VIEWER, visibilityLevel = "all" so canSee passes).
function visibleActivity(assigneeId: string = VIEWER): VisibleActivity {
  return {
    kind: "activity",
    assigneeId,
    ownerId: OWNER,
    visibilityLevel: "all",
    visibilityGroupId: null,
    visibleToUserIds: [],
    pipelineVisibilityGroupId: null,
  };
}

describe("can matrix (permissions spec 8)", () => {
  test("A1: admin full access", () => {
    expect(can(u("admin", []), "deal.delete", visibleDeal(OWNER))).toBe(true);
  });
  test("A2: own scope, owner -> true", () => {
    expect(can(u("regular", ["deal.edit_own"]), "deal.edit", visibleDeal(VIEWER))).toBe(true);
  });
  test("A3: own scope, not owner -> false", () => {
    expect(can(u("regular", ["deal.edit_own"]), "deal.edit", visibleDeal(OWNER))).toBe(false);
  });
  test("A4: any scope -> true", () => {
    expect(can(u("regular", ["deal.edit_any"]), "deal.edit", visibleDeal(OWNER))).toBe(true);
  });
  test("A5: cannot act on invisible record", () => {
    expect(can(u("regular", ["deal.edit_any"]), "deal.edit", invisibleDeal())).toBe(false);
  });
  test("A6: missing global flag -> false", () => {
    expect(can(u("regular", []), "data.export")).toBe(false);
  });
  test("A7: visible but no delete flag -> false", () => {
    expect(can(u("regular", []), "deal.delete", visibleDeal(VIEWER))).toBe(false);
  });
  test("inactive denies everything before admin", () => {
    expect(can(u("admin", [], { isActive: false }), "deal.delete", visibleDeal(OWNER))).toBe(false);
  });
  test("record-scoped action with no record fails closed", () => {
    expect(can(u("regular", ["deal.edit_any"]), "deal.edit")).toBe(false);
  });
  test("activity assignee may edit/complete without _own/_any flags", () => {
    const activity = visibleActivity(VIEWER);
    expect(can(u("regular", []), "activity.edit", activity)).toBe(true);
    expect(can(u("regular", []), "activity.complete", activity)).toBe(true);
  });
  test("activity delete is NOT covered by the assignee exception", () => {
    expect(can(u("regular", []), "activity.delete", visibleActivity(VIEWER))).toBe(false);
  });
  test("non-assignee regular user is denied activity.complete without flags", () => {
    // assigneeId is OWNER, viewer is VIEWER: the assignee exception must not fire
    expect(can(u("regular", []), "activity.complete", visibleActivity(OWNER))).toBe(false);
  });

  // Team-manager scope: managedUserIds contains OWNER (populated via team.viewMembers at hydration),
  // so an owner-level deal owned by OWNER is visible (canSee via managesOwner).
  test("team-manager edits a managed member's deal (edit_team + manages owner)", () => {
    const mgr = u("regular", ["deal.edit_team"], { managedUserIds: new Set([OWNER]) });
    expect(can(mgr, "deal.edit", invisibleDeal())).toBe(true);
  });
  test("edit_team without managing that owner -> denied", () => {
    const mgr = u("regular", ["deal.edit_team"], { managedUserIds: new Set(["other"]) });
    expect(can(mgr, "deal.edit", invisibleDeal())).toBe(false);
  });
  test("managing the owner without edit_team -> view only, cannot edit", () => {
    const mgr = u("regular", [], { managedUserIds: new Set([OWNER]) });
    expect(can(mgr, "deal.edit", invisibleDeal())).toBe(false);
  });
  test("team-manager reassigns a managed member's deal (changeOwner_team)", () => {
    const mgr = u("regular", ["deal.changeOwner_team"], { managedUserIds: new Set([OWNER]) });
    expect(can(mgr, "deal.changeOwner", invisibleDeal())).toBe(true);
  });
  test("team scope does NOT grant delete (delete has no _team variant)", () => {
    const mgr = u("regular", ["deal.edit_team"], { managedUserIds: new Set([OWNER]) });
    expect(can(mgr, "deal.delete", invisibleDeal())).toBe(false);
  });
});
