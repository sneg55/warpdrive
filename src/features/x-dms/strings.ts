export const X_INBOX_URL = "https://x.com/messages";
export const X_SETTINGS_URL = "/settings/team-mailboxes";

export const X_DM_STRINGS = {
  encryptedMarker: "Encrypted",
  encryptedHeading: "End-to-end encrypted",
  encryptedBody:
    "This conversation is end-to-end encrypted, so it can only be read and answered in the X app.",
  openInX: "Open in X",
  unreadInX: "Unread in X",
  unread: "Unread",
  chooseTemplate: "Choose template",
  noTemplates: "No templates yet",
  attachment: "[attachment]",
  rateLimited: (time: string): string =>
    `This X account hit its reply limit. Try again after ${time}.`,
  rateLimitedNoReset: "This X account hit its reply limit. Try again in a few minutes.",
  reconnectRequired: "This X account must be reconnected by an admin before replies can be sent.",
  sendMayHaveSent:
    "This reply may have been sent. Check the conversation after the next sync before sending it again.",
  sendFailed: "The reply was not sent.",
  sentNotRecorded:
    "Sent, but Warpdrive could not record it yet. It will appear after the next sync.",
  staleBuild: "Warpdrive was updated while this page was open. Reload the page, then send again.",
  unreadable: "Message could not be read",
  unreadableEncrypted: "This message was encrypted with an earlier key and can't be read",
  encryptedUnlockHint: "An admin can unlock encrypted messages in Settings.",
  openSettings: "Open Settings",
  sendUnconfirmed: "We could not confirm the send. Check the conversation before trying again.",
  errorId: (id: string): string => `Error ID: ${id}`,
  replyLabel: "Reply",
  replyPlaceholder: "Write a reply. Cmd or Ctrl+Enter sends.",
  send: "Send",
  sending: "Sending",
  inbox: "Inbox",
  archive: "Archive",
  unarchive: "Unarchive",
  markUnread: "Mark as unread",
  back: "Back",
  loading: "Loading...",
  loadMore: "Load more",
  loadingMore: "Loading more...",
  loadFailed: "Could not load conversations.",
  emptyInbox: "No conversations yet.",
  emptyArchived: "No archived conversations.",
  unknownParticipant: "X user",
  xMark: "𝕏",
  messages: "Messages",
  conversation: "Conversation",
  keysLocked: "Encrypted messages: locked",
  keysStale: "Encrypted messages: need unlocking again",
  keysUnlocked: (name: string | null, date: string): string =>
    name === null
      ? `Encrypted messages: unlocked, ${date}`
      : `Encrypted messages: unlocked by ${name}, ${date}`,
  unlock: "Unlock",
  unlockAgain: "Unlock again",
  unlocking: "Unlocking",
  removeKeys: "Remove keys",
  removeKeysTitle: "Remove encrypted message keys?",
  removeKeysBody:
    "Encrypted messages that arrive from now on will not be readable and replies will stop until an admin unlocks again. Messages already shown stay visible.",
  unlockTitle: "Unlock encrypted messages",
  unlockNote: "Each wrong passcode uses up one of a limited number of attempts at X.",
  passcodeLabel: "Passcode",
  cancel: "Cancel",
  unlockFailed: "Could not unlock. Try again.",
  removeKeysFailed: "Could not remove the keys. Try again.",
  wrongPasscode: (n: number): string =>
    `Wrong passcode. X allows ${n} more ${n === 1 ? "attempt" : "attempts"}.`,
  wrongPasscodeNoCount: "Wrong passcode.",
  noAttemptsLeft:
    "No attempts left. The keys are gone at X; set up encrypted messages again in the X app.",
} as const;
