import { describe, expect, it } from "vitest";
import { filterUsersByStatus, type UserStatus, userStatus } from "./userStatus";

type Row = { id: string; isActive: boolean; invitedAt: string | null };

const active: Row = { id: "a", isActive: true, invitedAt: null };
const invited: Row = { id: "b", isActive: true, invitedAt: "2026-07-01" };
const deactivated: Row = { id: "c", isActive: false, invitedAt: null };
// A deactivated user who still has a pending invite: deactivation wins.
const deactivatedInvited: Row = { id: "d", isActive: false, invitedAt: "2026-07-01" };

describe("userStatus", () => {
  it("classifies an active user", () => {
    expect(userStatus(active)).toBe("active");
  });
  it("classifies a pending invite", () => {
    expect(userStatus(invited)).toBe("invited");
  });
  it("classifies a deactivated user", () => {
    expect(userStatus(deactivated)).toBe("deactivated");
  });
  it("treats deactivation as taking precedence over a pending invite", () => {
    expect(userStatus(deactivatedInvited)).toBe("deactivated");
  });
});

describe("filterUsersByStatus", () => {
  const rows = [active, invited, deactivated, deactivatedInvited];

  it("returns everyone for 'all'", () => {
    expect(filterUsersByStatus(rows, "all").map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it.each<[UserStatus, string[]]>([
    ["active", ["a"]],
    ["invited", ["b"]],
    ["deactivated", ["c", "d"]],
  ])("narrows to %s", (status, ids) => {
    expect(filterUsersByStatus(rows, status).map((r) => r.id)).toEqual(ids);
  });
});
