// Named constants for the composer component tree. No magic strings in components.

// Client-side file size guard for AttachButton. Matches the server env default
// (MAX_FILE_BYTES = 26_214_400 = 25 MB). The server re-validates; this is a
// fast UX gate that avoids a round-trip for obviously oversized files.
export const ATTACH_MAX_FILE_BYTES = 26_214_400;

export const COMPOSER_STRINGS = {
  addAsActivityLabel: "Add as activity",
  addAsActivityTooltip: "Activity will be logged against this deal when the email is sent",
  visibilityLabel: "Visible to everyone",
  defaultActivitySubject: "Email sent",
  // System key for the email activity type (matches seed data in activityTypes.ts).
  emailActivityTypeKey: "email",
  // Inline validation shown when the Send-later time is not strictly in the future.
  scheduledPastMessage: "Choose a time in the future",
  // Compose header controls (email-tab): Settings cog link + Close.
  headerSettingsLabel: "Email settings",
  headerCloseLabel: "Close",
  // Footer signature picker.
  signaturePickerLabel: "Signature",
  signatureNoneLabel: "None",
  signatureTitle: (name: string): string => `Signature: ${name}`,
} as const;
