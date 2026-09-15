import { describe, expect, it, vi } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import * as perms from "@/features/permissions/can";
import type { PermSetUser } from "@/features/permissions/effective";
import { ownerScope } from "./ownerScope";

function makeActor(flags: PermissionFlagKey[] = []): PermSetUser {
  return {
    id: "u1",
    type: "regular",
    isActive: true,
    groupIds: new Set<string>(),
    flags: new Set<PermissionFlagKey>(flags),
  };
}

describe("ownerScope", () => {
  it('always returns "me" when requested is "me"', () => {
    vi.spyOn(perms, "can").mockReturnValue(true);
    expect(ownerScope(makeActor(["stats.viewOthers"]), { kind: "me" })).toEqual({ kind: "me" });
  });

  it('forces "me" when the actor lacks stats.viewOthers', () => {
    vi.spyOn(perms, "can").mockReturnValue(false);
    expect(ownerScope(makeActor(), { kind: "all" })).toEqual({ kind: "me" });
  });

  it('honors "all" when the actor has stats.viewOthers', () => {
    vi.spyOn(perms, "can").mockReturnValue(true);
    expect(ownerScope(makeActor(["stats.viewOthers"]), { kind: "all" })).toEqual({ kind: "all" });
  });

  it("honors a named user when the actor has stats.viewOthers", () => {
    vi.spyOn(perms, "can").mockReturnValue(true);
    expect(ownerScope(makeActor(["stats.viewOthers"]), { kind: "user", userId: "u2" })).toEqual({
      kind: "user",
      userId: "u2",
    });
  });

  it("honors a team when the actor has stats.viewOthers", () => {
    vi.spyOn(perms, "can").mockReturnValue(true);
    expect(ownerScope(makeActor(["stats.viewOthers"]), { kind: "team", teamId: "t1" })).toEqual({
      kind: "team",
      teamId: "t1",
    });
  });

  it("forces a named user to 'me' when the actor lacks stats.viewOthers", () => {
    vi.spyOn(perms, "can").mockReturnValue(false);
    expect(ownerScope(makeActor(), { kind: "user", userId: "u2" })).toEqual({ kind: "me" });
  });

  it("collapses the actor's own id to 'me' without stats.viewOthers", () => {
    vi.spyOn(perms, "can").mockReturnValue(false);
    expect(ownerScope(makeActor(), { kind: "user", userId: "u1" })).toEqual({ kind: "me" });
  });

  it("forces a team to 'me' when the actor lacks stats.viewOthers", () => {
    vi.spyOn(perms, "can").mockReturnValue(false);
    expect(ownerScope(makeActor(), { kind: "team", teamId: "t1" })).toEqual({ kind: "me" });
  });
});
