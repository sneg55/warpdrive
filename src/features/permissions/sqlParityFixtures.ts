export const VIEWER = "11111111-1111-1111-1111-111111111111";
export const OWNER = "22222222-2222-2222-2222-222222222222";
export const GROUP = "33333333-3333-3333-3333-333333333333";
export const PGROUP = "44444444-4444-4444-4444-444444444444";
export const STRANGER = "55555555-5555-5555-5555-555555555555";

export interface Fixture {
  id: string;
  ownerId: string | null;
  visibilityLevel: "owner" | "group" | "all";
  visibilityGroupId: string | null;
  visibleToUserIds: string[];
  pipelineVisibilityGroupId: string | null;
}

const F_ALL_OWNER = "00000000-0000-0000-0000-000000000001";
const F_OWNER_OWNER = "00000000-0000-0000-0000-000000000002";
const F_OWNER_VIEWER = "00000000-0000-0000-0000-000000000003";
export const F_GROUP = "00000000-0000-0000-0000-000000000004";
const F_ALL_RESTRICTED = "00000000-0000-0000-0000-000000000005";
export const F_NULL_OWNER = "00000000-0000-0000-0000-000000000006";
export const F_VISIBLE_TO = "00000000-0000-0000-0000-000000000007";
const F_GROUP_RESTRICTED = "00000000-0000-0000-0000-000000000008";

export const FIXTURES: Fixture[] = [
  {
    id: F_ALL_OWNER,
    ownerId: OWNER,
    visibilityLevel: "all",
    visibilityGroupId: null,
    visibleToUserIds: [],
    pipelineVisibilityGroupId: null,
  },
  {
    id: F_OWNER_OWNER,
    ownerId: OWNER,
    visibilityLevel: "owner",
    visibilityGroupId: null,
    visibleToUserIds: [],
    pipelineVisibilityGroupId: null,
  },
  {
    id: F_OWNER_VIEWER,
    ownerId: VIEWER,
    visibilityLevel: "owner",
    visibilityGroupId: null,
    visibleToUserIds: [],
    pipelineVisibilityGroupId: null,
  },
  {
    id: F_GROUP,
    ownerId: OWNER,
    visibilityLevel: "group",
    visibilityGroupId: GROUP,
    visibleToUserIds: [],
    pipelineVisibilityGroupId: null,
  },
  {
    id: F_ALL_RESTRICTED,
    ownerId: VIEWER,
    visibilityLevel: "all",
    visibilityGroupId: null,
    visibleToUserIds: [],
    pipelineVisibilityGroupId: PGROUP,
  },
  {
    id: F_NULL_OWNER,
    ownerId: null,
    visibilityLevel: "owner",
    visibilityGroupId: null,
    visibleToUserIds: [],
    pipelineVisibilityGroupId: null,
  },
  {
    id: F_VISIBLE_TO,
    ownerId: OWNER,
    visibilityLevel: "owner",
    visibilityGroupId: null,
    visibleToUserIds: [STRANGER],
    pipelineVisibilityGroupId: null,
  },
  {
    id: F_GROUP_RESTRICTED,
    ownerId: OWNER,
    visibilityLevel: "group",
    visibilityGroupId: GROUP,
    visibleToUserIds: [],
    pipelineVisibilityGroupId: PGROUP,
  },
];
