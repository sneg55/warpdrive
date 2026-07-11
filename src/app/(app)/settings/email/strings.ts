// Co-located copy for the Email templates + signatures settings page. Kept out of the global
// src/constants/strings.ts so that shared file stays within its size budget; this page is the
// only consumer. The nav label reuses the existing STRINGS.settings.emailTemplates.
export const EMAIL_SETTINGS_STRINGS = {
  description: "Manage reusable templates and signatures for outgoing email.",
  templates: "Templates",
  signatures: "Signatures",
  newTemplate: "New template",
  newSignature: "New signature",
  shareWithTeam: "Share with team",
  setDefault: "Set as default",
  defaultBadge: "Default",
  sharedBadge: "Shared",
  nameLabel: "Name",
  maxNameHint: "Max 40 characters",
  subjectLabel: "Subject",
  bodyLabel: "Body",
  save: "Save",
  cancel: "Cancel",
  edit: "Edit",
  delete: "Delete",
  empty: "Nothing here yet.",
  // T2 search + T4 management-table columns and bulk controls.
  searchTemplates: "Search templates",
  createdOnHeader: "Created",
  ownerHeader: "Owner",
  nameHeader: "Name",
  you: "You",
  select: "Select",
  selectAll: "Select all templates",
  deleteSelected: "Delete selected",
  reorder: "Reorder",
} as const;
