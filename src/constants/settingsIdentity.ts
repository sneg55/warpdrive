// UI strings and the action-error mapper for the identity settings area
// (users, teams, permission sets, visibility groups). Kept separate from the
// large shared strings.ts to stay under the file-size limit and to co-locate
// the raw-error -> readable-message mapping these forms share.

export const IDENTITY_SETTINGS_STRINGS = {
  flagEditor: {
    global: "Global",
    ownership: "Ownership",
    save: "Save flags",
    saving: "Saving...",
  },
  teamEditor: {
    createTitle: "Create a team",
    nameLabel: "Team name",
    namePlaceholder: "New team name",
    create: "Create",
    creating: "Creating...",
    manager: "Manager",
    managerNone: "No manager",
    members: "Members",
    membersHelp: "Select the users who belong to this team.",
  },
} as const;

// Readable, user-facing copy for each distinct failure. The identity actions
// return a plain `string` error (see Result<T, string>); we translate the known
// internal strings into friendly messages and fall back to a generic one so no
// raw internal wording ever leaks to the UI.
export const IDENTITY_ERROR_MESSAGES = {
  generic: "Something went wrong. Please try again.",
  session: "Your session looks stale. Refresh the page and try again.",
  permission: "You do not have permission to do that.",
  selfPromote: "You can't grant yourself admin.",
  lastAdmin: "You can't remove the last active administrator.",
  selfDeactivate: "You can't deactivate your own account.",
  reactivateAdmin: "Only an administrator can reactivate users.",
  selfPermissionSet: "You can't edit your own permission set.",
  notFound: "That record no longer exists.",
  invalidInput: "Some of the details entered are invalid.",
} as const;

type ErrorKey = keyof typeof IDENTITY_ERROR_MESSAGES;

// Maps the raw error strings thrown by the identity guards/actions to a message key.
const RAW_ERROR_TO_KEY: Record<string, ErrorKey> = {
  unauthorized: "permission",
  "permissions.manage required": "permission",
  "admin required to change admin role": "permission",
  "admin required to deactivate users": "permission",
  "admin required to reactivate users": "reactivateAdmin",
  "missing csrf token": "session",
  "csrf token mismatch": "session",
  "origin mismatch": "session",
  "cross-site request rejected": "session",
  "cannot self-promote": "selfPromote",
  "cannot deactivate the last active admin": "lastAdmin",
  "cannot demote the last active admin": "lastAdmin",
  "cannot deactivate yourself": "selfDeactivate",
  "cannot edit your own permission set": "selfPermissionSet",
  "cannot reassign your own permission set": "selfPermissionSet",
  not_found: "notFound",
  "permission set not found": "notFound",
  "invalid input": "invalidInput",
};

// Translate an identity action error string into a readable inline-form message.
export function identityErrorMessage(error: string): string {
  const key = RAW_ERROR_TO_KEY[error];
  return key === undefined ? IDENTITY_ERROR_MESSAGES.generic : IDENTITY_ERROR_MESSAGES[key];
}
