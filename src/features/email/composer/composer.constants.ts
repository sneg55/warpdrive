// Named constants for the composer component tree. No magic strings in components.

// Client-side file size guard for AttachButton. Matches the server env default
// (MAX_FILE_BYTES = 26_214_400 = 25 MB). The server re-validates; this is a
// fast UX gate that avoids a round-trip for obviously oversized files.
export const ATTACH_MAX_FILE_BYTES = 26_214_400;

export const COMPOSER_STRINGS = {
  addAsActivityLabel: "Add as activity",
  addAsActivityTooltip: "Activity will be logged against this deal when the email is sent",
  // Compose visibility (C1): "shared" reads as visible-to-everyone, "private" as private-to-you.
  // visibilityLabel is the shared/default wording; visibilityPickerLabel is the trigger aria-label.
  visibilityLabel: "Visible to everyone",
  visibilityPrivateLabel: "Private to you",
  visibilityPickerLabel: "Email visibility",
  defaultActivitySubject: "Email sent",
  // System key for the email activity type (matches seed data in activityTypes.ts).
  emailActivityTypeKey: "email",
  // Inline validation shown when the Send-later time is not strictly in the future.
  scheduledPastMessage: "Choose a time in the future",
  // Compose header controls (email-tab): Settings cog link + Close.
  headerSettingsLabel: "Email settings",
  headerCloseLabel: "Close",
  // Toolbar signature picker.
  signaturePickerLabel: "Signature",
  signatureNoneLabel: "None",
  signatureTitle: (name: string): string => `Signature: ${name}`,
} as const;
