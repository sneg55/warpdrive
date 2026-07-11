"use server";

// Visibility-group actions.
export {
  addGroupMemberAction,
  createGroupAction,
  removeGroupMemberAction,
} from "./actions/groups";

// Permission-set actions.
export {
  createPermissionSetAction,
  updateFlagsAction,
} from "./actions/permission-sets";
// Re-export the unit-testable helper (test imports from "./actions").
export { runWithActor } from "./actions/shared";

// Team actions.
export { createTeamAction, setTeamMembersAction } from "./actions/teams";

// User actions.
export {
  assignPermissionSetAction,
  setUserActiveAction,
  setUserAdminAction,
} from "./actions/users";
