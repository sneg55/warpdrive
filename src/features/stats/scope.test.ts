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
    expect(ownerScope(makeActor(["stats.viewOthers"]), "me")).toBe("me");
  });

  it('forces "me" when the actor lacks stats.viewOthers', () => {
    vi.spyOn(perms, "can").mockReturnValue(false);
    expect(ownerScope(makeActor(), "all")).toBe("me");
  });

  it('honors "all" when the actor has stats.viewOthers', () => {
    vi.spyOn(perms, "can").mockReturnValue(true);
    expect(ownerScope(makeActor(["stats.viewOthers"]), "all")).toBe("all");
  });
});
