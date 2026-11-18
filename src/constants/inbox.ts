export const INBOX_PAGE_SIZE = 50;

export const INBOX_SCAN_CHUNK = 100;

export const MAILBOX_FOLDERS = ["inbox", "sent", "archive"] as const;
export type MailboxFolder = (typeof MAILBOX_FOLDERS)[number];

export const INBOX_SYNC_PHASE_POLL_MS = 10_000;
export const INBOX_SYNC_FAILED_POLL_MS = 60_000;
