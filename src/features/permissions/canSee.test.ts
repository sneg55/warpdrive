import { describe, expect, test } from "vitest";
import { canSee } from "./canSee";
import type { AuthUser, VisibleDeal, VisiblePersonOrOrg } from "./types";

const VIEWER = "viewer";
const OWNER = "owner";
const GROUP = "g1";

function user(over: Partial<AuthUser> = {}): AuthUser {
  return { id: VIEWER, type: "regular", isActive: true, groupIds: new Set(), ...over };
}
function deal(over: Partial<VisibleDeal> = {}): VisibleDeal {
  return {
    kind: "deal",
    ownerId: OWNER,
    visibilityLevel: "all",
    visibilityGroupId: null,
    visibleToUserIds: [],
    pipelineVisibilityGroupId: null,
    ...over,
  };
}

describe("canSee matrix (permissions spec 8)", () => {
  test("0: inactive regular -> false", () => {
    expect(canSee(user({ isActive: false }), deal())).toBe(false);
  });
  test("0b: inactive admin -> false (rule 0 before admin bypass)", () => {
    expect(
      canSee(
        user({ type: "admin", isActive: false }),
        deal({ visibilityLevel: "owner", pipelineVisibilityGroupId: "gx" }),
      ),
    ).toBe(false);
  });
  test("1: admin bypass even on restricted owner-level deal", () => {
    expect(
      canSee(
        user({ type: "admin" }),
        deal({ visibilityLevel: "owner", pipelineVisibilityGroupId: "gx" }),
      ),
    ).toBe(true);
  });
  test("2: level all, unrestricted -> true", () => {
    expect(canSee(user(), deal({ visibilityLevel: "all" }))).toBe(true);
  });
  test("3: ownership -> true", () => {
    expect(canSee(user({ id: OWNER }), deal({ visibilityLevel: "owner" }))).toBe(true);
  });
  test("4: owner-level, not owner -> false", () => {
    expect(canSee(user(), deal({ visibilityLevel: "owner" }))).toBe(false);
  });
  test("5: visible_to_user_ids grant -> true", () => {
    expect(canSee(user(), deal({ visibilityLevel: "owner", visibleToUserIds: [VIEWER] }))).toBe(
      true,
    );
  });
  test("6: member of record's group -> true", () => {
    expect(
      canSee(
        user({ groupIds: new Set([GROUP]) }),
        deal({ visibilityLevel: "group", visibilityGroupId: GROUP }),
      ),
    ).toBe(true);
  });
  test("7: not in record's group -> false", () => {
    expect(canSee(user(), deal({ visibilityLevel: "group", visibilityGroupId: GROUP }))).toBe(
      false,
    );
  });
  test("8: visible_to_user_ids overrides group non-membership -> true", () => {
    expect(
      canSee(
        user(),
        deal({ visibilityLevel: "group", visibilityGroupId: GROUP, visibleToUserIds: [VIEWER] }),
      ),
    ).toBe(true);
  });
  test("9: pipeline gate beats level all -> false", () => {
    expect(canSee(user(), deal({ visibilityLevel: "all", pipelineVisibilityGroupId: "gx" }))).toBe(
      false,
    );
  });
  test("10: pipeline gate beats ownership -> false", () => {
    expect(
      canSee(
        user({ id: OWNER }),
        deal({ visibilityLevel: "owner", pipelineVisibilityGroupId: "gx" }),
      ),
    ).toBe(false);
  });
  test("11: pipeline gate beats visible_to + group -> false", () => {
    expect(
      canSee(
        user({ groupIds: new Set([GROUP]) }),
        deal({
          visibilityLevel: "group",
          visibilityGroupId: GROUP,
          visibleToUserIds: [VIEWER],
          pipelineVisibilityGroupId: "gx",
        }),
      ),
    ).toBe(false);
  });
  test("12: member passes gate, then level all -> true", () => {
    expect(
      canSee(
        user({ groupIds: new Set(["pg"]) }),
        deal({ visibilityLevel: "all", pipelineVisibilityGroupId: "pg" }),
      ),
    ).toBe(true);
  });
  test("13: member passes gate, then record's group -> true", () => {
    expect(
      canSee(
        user({ groupIds: new Set(["pg", GROUP]) }),
        deal({
          visibilityLevel: "group",
          visibilityGroupId: GROUP,
          pipelineVisibilityGroupId: "pg",
        }),
      ),
    ).toBe(true);
  });
  test("14: unowned + level all -> true", () => {
    expect(canSee(user(), deal({ ownerId: null, visibilityLevel: "all" }))).toBe(true);
  });
  test("15: unowned group record visible to its group's members -> true", () => {
    expect(
      canSee(
        user({ groupIds: new Set([GROUP]) }),
        deal({ ownerId: null, visibilityLevel: "group", visibilityGroupId: GROUP }),
      ),
    ).toBe(true);
  });
  test("15b: unowned group record, viewer not in its group -> false", () => {
    expect(
      canSee(user(), deal({ ownerId: null, visibilityLevel: "group", visibilityGroupId: GROUP })),
    ).toBe(false);
  });
  test("16: unowned owner-level rescued by visible_to -> true", () => {
    expect(
      canSee(user(), deal({ ownerId: null, visibilityLevel: "owner", visibleToUserIds: [VIEWER] })),
    ).toBe(true);
  });
  test("17: multi-group owner does not widen (record's one group only)", () => {
    expect(
      canSee(
        user({ groupIds: new Set([GROUP]) }),
        deal({ visibilityLevel: "group", visibilityGroupId: GROUP }),
      ),
    ).toBe(true);
  });

  test("person/org: no pipeline clause; group binds to record group", () => {
    const person: VisiblePersonOrOrg = {
      kind: "person",
      ownerId: OWNER,
      visibilityLevel: "group",
      visibilityGroupId: GROUP,
      visibleToUserIds: [],
    };
    expect(canSee(user(), person)).toBe(false);
    expect(canSee(user({ groupIds: new Set([GROUP]) }), person)).toBe(true);
  });

  // Team-manager view: managedUserIds (already gated on team.viewMembers at hydration) grants
  // visibility to an owner-level record owned by a managed member.
  test("team-manager sees a managed member's owner-level record", () => {
    expect(
      canSee(user({ managedUserIds: new Set([OWNER]) }), deal({ visibilityLevel: "owner" })),
    ).toBe(true);
  });
  test("team-manager visibility does NOT bypass a restricted pipeline (hard gate wins)", () => {
    expect(
      canSee(
        user({ managedUserIds: new Set([OWNER]) }),
        deal({ visibilityLevel: "owner", pipelineVisibilityGroupId: "gx" }),
      ),
    ).toBe(false);
  });
  test("owner-level record whose owner is NOT managed stays hidden", () => {
    expect(
      canSee(user({ managedUserIds: new Set(["other"]) }), deal({ visibilityLevel: "owner" })),
    ).toBe(false);
  });
});
