export const EMAIL_ACCOUNT_STATUS = ["connected", "disconnected", "error"] as const;
export const EMAIL_MESSAGE_DIRECTION = ["inbound", "outbound"] as const;
export const GMAIL_DRAFT_LABEL = "DRAFT";
export const EMAIL_SEND_STATUS = [
  "pending",
  "sending",
  "sent",
  "failed",
  "needs_review",
  "waiting_for_limit",
] as const;
export const EMAIL_PROVIDER_KIND = { gmail: "gmail", agenticInbox: "agentic_inbox" } as const;
export const EMAIL_PROVIDER = [
  EMAIL_PROVIDER_KIND.gmail,
  EMAIL_PROVIDER_KIND.agenticInbox,
] as const;
export const EMAIL_SNIPPET_MAX_CHARS = 200;
export const AGENTIC_CHANGES_PAGE_LIMIT = 100;
export const AGENTIC_FOLDER = {
  sent: "sent",
  draft: "draft",
  spam: "spam",
  trash: "trash",
} as const;
export const AGENTIC_UNIMPORTED_FOLDERS: readonly string[] = [
  AGENTIC_FOLDER.draft,
  AGENTIC_FOLDER.spam,
  AGENTIC_FOLDER.trash,
];
export const EMAIL_VISIBILITY = ["private", "shared"] as const;
export const EMAIL_TRACKING_EVENT_TYPE = ["open", "click"] as const;
// Reader follow-up controls (B1): status is single-select, labels are multi-select tags.
export const MAIL_FOLLOW_UP_STATUS = ["none", "waiting", "replied", "closed"] as const;
export const MAIL_LABELS = ["important", "to_do", "later"] as const;

// Inbound polling (ops spec B3): 90s cadence, deterministic per-mailbox jitter.
export const SYNC_CADENCE_SECONDS = 90;
export const SYNC_STALL_SECONDS = 15 * 60;
// Resync gap-recovery (ops spec B3): subtract this margin from last_sync_at when
// building the recent-window backfill query so boundary replies are not missed.
export const RESYNC_WINDOW_MARGIN_SECONDS = 600;
export const SYNC_JITTER_MODULO_SECONDS = 90;
// Token refresh skew (ops spec B2): refresh if within 60s of expiry.
export const TOKEN_REFRESH_SKEW_SECONDS = 60;
// Outbox lease (ops spec B6): a sending row older than this is reclaimable.
export const CLAIM_LEASE_SECONDS = 120;
// Reconcile settling window for accepted-unknown sends (ops spec B6).
export const RECONCILE_WINDOW_MS = 600_000;
export const AGENTIC_RETRY_LATER_DEFAULT_MS = 300_000;
export const AGENTIC_MAX_RECIPIENTS = 50;
// Quota backoff (ops spec B3): 2s start.
export const BACKOFF_START_MS = 2_000;
// In-mail search input debounce (InboxSearchBar): batches keystrokes into one query.
export const INBOX_SEARCH_DEBOUNCE_MS = 250;
export const RECIPIENT_SEARCH_LIMIT = 10;
export const RECIPIENT_SEARCH_SCAN = 200;
export const RECIPIENT_SEARCH_DEBOUNCE_MS = 200;
export const RECIPIENT_SEARCH_MAX_QUERY = 100;
export const RECIPIENT_SEARCH_MAX_EXCLUDE = 200;
export const AGENTIC_ACTION_TIMEOUT_MS = 30_000;
export const AGENTIC_ENQUEUE_TIMEOUT_MS = 10_000;
