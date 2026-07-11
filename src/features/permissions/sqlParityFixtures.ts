// Shared fixtures + ids for the dealVisibilityPredicate<->canSee parity test. Extracted to keep
// the test file under the size cap; both sides are driven from THESE rows so they cannot drift.
export const VIEWER = "11111111-1111-1111-1111-111111111111";
export const OWNER = "22222222-2222-2222-2222-222222222222";
export const GROUP = "33333333-3333-3333-3333-333333333333";
export const PGROUP = "44444444-4444-4444-4444-444444444444";
export const STRANGER = "55555555-5555-5555-5555-555555555555";

// One shared fixture list. Both canSee and the SQL predicate are driven from THESE rows,
// so the two cannot drift: the assertion is id-set equality, not cardinality.
export interface Fixture {
  id: string;
  ownerId: string | null;
  visibilityLevel: "owner" | "group" | "all";
  visibilityGroupId: string | null;
  visibleToUserIds: string[];
  pipelineVisibilityGroupId: string | null;
}

export const F_ALL_OWNER = "00000000-0000-0000-0000-000000000001";
export const F_OWNER_OWNER = "00000000-0000-0000-0000-000000000002";
export const F_OWNER_VIEWER = "00000000-0000-0000-0000-000000000003";
export const F_GROUP = "00000000-0000-0000-0000-000000000004";
export const F_ALL_RESTRICTED = "00000000-0000-0000-0000-000000000005";
export const F_NULL_OWNER = "00000000-0000-0000-0000-000000000006";
export const F_VISIBLE_TO = "00000000-0000-0000-0000-000000000007";
export const F_GROUP_RESTRICTED = "00000000-0000-0000-0000-000000000008";

export const FIXTURES: Fixture[] = [
  // level all, owned by OWNER -> visible to everyone (no pipeline gate).
  {
    id: F_ALL_OWNER,
    ownerId: OWNER,
    visibilityLevel: "all",
    visibilityGroupId: null,
    visibleToUserIds: [],
    pipelineVisibilityGroupId: null,
  },
  // level owner, owned by OWNER -> hidden from non-owners.
  {
    id: F_OWNER_OWNER,
    ownerId: OWNER,
    visibilityLevel: "owner",
    visibilityGroupId: null,
    visibleToUserIds: [],
    pipelineVisibilityGroupId: null,
  },
  // level owner, owned by VIEWER -> visible to VIEWER via ownership.
  {
    id: F_OWNER_VIEWER,
    ownerId: VIEWER,
    visibilityLevel: "owner",
    visibilityGroupId: null,
    visibleToUserIds: [],
    pipelineVisibilityGroupId: null,
  },
  // level group GROUP -> visible to GROUP members.
  {
    id: F_GROUP,
    ownerId: OWNER,
    visibilityLevel: "group",
    visibilityGroupId: GROUP,
    visibleToUserIds: [],
    pipelineVisibilityGroupId: null,
  },
  // level all but restricted pipeline PGROUP -> hidden unless PGROUP member.
  {
    id: F_ALL_RESTRICTED,
    ownerId: VIEWER,
    visibilityLevel: "all",
    visibilityGroupId: null,
    visibleToUserIds: [],
    pipelineVisibilityGroupId: PGROUP,
  },
  // edge: level owner with ownerId NULL (unowned owner-only) -> hidden from every non-admin.
  {
    id: F_NULL_OWNER,
    ownerId: null,
    visibilityLevel: "owner",
    visibilityGroupId: null,
    visibleToUserIds: [],
    pipelineVisibilityGroupId: null,
  },
  // edge: additive allow grants STRANGER (non-owner, non-member) on an owner-level row -> visible to STRANGER.
  {
    id: F_VISIBLE_TO,
    ownerId: OWNER,
    visibilityLevel: "owner",
    visibilityGroupId: null,
    visibleToUserIds: [STRANGER],
    pipelineVisibilityGroupId: null,
  },
  // edge: level group GROUP, restricted pipeline PGROUP -> needs PGROUP gate AND GROUP membership.
  {
    id: F_GROUP_RESTRICTED,
    ownerId: OWNER,
    visibilityLevel: "group",
    visibilityGroupId: GROUP,
    visibleToUserIds: [],
    pipelineVisibilityGroupId: PGROUP,
  },
];
