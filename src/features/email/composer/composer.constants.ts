export const ATTACH_MAX_FILE_BYTES = 26_214_400;

export const COMPOSER_STRINGS = {
  addAsActivityLabel: "Add as activity",
  addAsActivityTooltip: "Activity will be logged against this deal when the email is sent",
  visibilityLabel: "Visible to everyone",
  visibilityPrivateLabel: "Private to you",
  visibilityPickerLabel: "Email visibility",
  defaultActivitySubject: "Email sent",
  emailActivityTypeKey: "email",
  scheduledPastMessage: "Choose a time in the future",
  sendUnconfirmed: "We could not confirm the send. Check the thread before trying again.",
  tooManyAgenticRecipients: "This mailbox can send to at most 50 recipients per message.",
  headerSettingsLabel: "Email settings",
  headerCloseLabel: "Close",
  signaturePickerLabel: "Signature",
  signatureNoneLabel: "None",
  signatureTitle: (name: string): string => `Signature: ${name}`,
} as const;
