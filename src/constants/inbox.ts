// How many visible threads one inbox page returns. Matches the People/Orgs lists' page size so
// "Load more" behaves the same everywhere.
export const INBOX_PAGE_SIZE = 50;

// How many candidate rows the query pulls per round trip while filling a page. Visibility and the
// unmatched/needs_linking filter are applied after the query, so a chunk can yield fewer visible
// threads than it holds and the scan repeats. Larger = fewer round trips but more wasted rows.
export const INBOX_SCAN_CHUNK = 100;

export const MAILBOX_FOLDERS = ["inbox", "sent", "archive"] as const;
export type MailboxFolder = (typeof MAILBOX_FOLDERS)[number];

export const INBOX_SYNC_PHASE_POLL_MS = 10_000;
export const INBOX_SYNC_FAILED_POLL_MS = 60_000;
