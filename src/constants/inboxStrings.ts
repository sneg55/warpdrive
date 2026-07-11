// Copy for the mail Inbox / reader (thread list, composer chrome, follow-up controls).
// Extracted from strings.ts to keep that file under the 300-line hard cap; referenced as
// STRINGS.inbox.
export const INBOX_STRINGS = {
  title: "Inbox",
  filterAll: "All",
  filterUnmatched: "Unmatched",
  filterNeedsLinking: "Needs linking",
  noThreads: "No threads found.",
  // Inbox pages 50 threads at a time (INBOX_PAGE_SIZE), matching the People/Orgs lists.
  loadMore: "Load more",
  loadingMore: "Loading...",
  searchLabel: "Search mail",
  searchPlaceholder: "Search mail...",
  showRemoteContent: "Show remote content",
  composerPlaceholder: "Write your reply...",
  send: "Send",
  replyAction: "Reply",
  replyAllAction: "Reply all",
  forwardAction: "Forward",
  // Sidebar link panel (search-to-link + create-and-auto-link, Pipedrive parity).
  sidebarContactHeading: "Contact",
  sidebarDealHeading: "Deal",
  linkExisting: "Link to existing",
  changeLink: "Change",
  createContact: "Create new contact",
  addNewDeal: "Add new deal",
  searchPeoplePlaceholder: "Search people...",
  searchDealsPlaceholder: "Search deals...",
  noMatches: "No matches.",
  viewContact: "View contact",
  viewDeal: "View deal",
  // Fallbacks for the reader's linked-record chips when the name/title didn't load (never the
  // type noun "Person"/"Deal", which reads as a placeholder).
  linkedPersonFallback: "Linked contact",
  linkedDealFallback: "Linked deal",
  errorSend: "Failed to send. Please try again.",
  errorMarkUnread: "Failed to mark as unread. Please try again.",
  markAsUnread: "Mark as unread",
  // Reader top bar (Back link + Archive action) and the row attachment indicator.
  back: "Back",
  backToInbox: "Back to inbox",
  previousConversation: "Previous conversation",
  nextConversation: "Next conversation",
  archive: "Archive",
  delete: "Delete",
  deleteConfirmTitle: "Move this conversation to Trash?",
  deleteConfirmBody: "It moves to your Gmail Trash.",
  deleteConfirmAction: "Move to Trash",
  deleteCancel: "Cancel",
  hasAttachmentLabel: "Has attachment",
  // Quick-filters row (P2): attachment/unread toggles + date-range preset + Clear.
  unreadOnlyLabel: "Unread only",
  dateRangeLabel: "Date range",
  dateRangeAny: "Any time",
  dateRange7d: "Last 7 days",
  dateRange30d: "Last 30 days",
  clearFilters: "Clear",
  followUpStatusLabel: "Follow-up",
  errorSetFollowUpStatus: "Failed to set follow-up status. Please try again.",
  errorSetLabels: "Failed to update labels. Please try again.",
  followUpStatusNames: {
    none: "None",
    waiting: "Waiting",
    replied: "Replied",
    closed: "Closed",
  },
  labelNames: {
    important: "Important",
    to_do: "To do",
    later: "Later",
  },
  // Persisted per-message open/click history (source of record), rendered under each
  // outbound message in the reader. Distinct from the transient WS badge in the thread
  // header, which only nudges for the current session.
  trackingOpened: (n: number): string => `Opened ${n} ${n === 1 ? "time" : "times"}`,
  trackingClicked: (n: number): string => `Clicked ${n} ${n === 1 ? "time" : "times"}`,
} as const;
