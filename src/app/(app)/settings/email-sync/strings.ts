// Co-located copy for the Email sync settings page. Kept out of the global src/constants/strings.ts
// so that shared file stays within its size budget; this page is the only consumer.
export const EMAIL_SYNC_STRINGS = {
  title: "Email sync",
  intro: "Connect your Google Workspace mailbox to sync email into Warpdrive.",
  statusConnected: "Connected",
  statusDisconnected: "Disconnected",
  statusError: "Needs attention",
  connectedAs: (email: string) => `Connected as ${email}`,
  notConnected: "No mailbox is connected yet.",
  lastSynced: (when: string) => `Last synced ${when}`,
  neverSynced: "Not synced yet",
  lastErrorLabel: "Last error",
  connect: "Connect Gmail",
  reconnect: "Reconnect",
  disconnect: "Disconnect",
  connecting: "Connecting...",
  disconnecting: "Disconnecting...",
  actionError: "Could not complete that action. Please try again.",
  requiresAuth: "Please sign in to view this page.",
} as const;
