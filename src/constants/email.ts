export const EMAIL_ACCOUNT_STATUS = ["connected", "disconnected", "error"] as const;
export const EMAIL_MESSAGE_DIRECTION = ["inbound", "outbound"] as const;
export const EMAIL_SEND_STATUS = ["pending", "sending", "sent", "failed", "needs_review"] as const;
export const EMAIL_VISIBILITY = ["private", "shared"] as const;
export const EMAIL_TRACKING_EVENT_TYPE = ["open", "click"] as const;
// Reader follow-up controls (B1): status is single-select, labels are multi-select tags.
export const MAIL_FOLLOW_UP_STATUS = ["none", "waiting", "replied", "closed"] as const;
export const MAIL_LABELS = ["important", "to_do", "later"] as const;

// Inbound polling (ops spec B3): 90s cadence, deterministic per-mailbox jitter.
export const SYNC_CADENCE_SECONDS = 90;
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
// Quota backoff (ops spec B3): 2s start, double to 15 min cap.
export const BACKOFF_START_MS = 2_000;
export const BACKOFF_CAP_MS = 900_000;
// In-mail search input debounce (InboxSearchBar): batches keystrokes into one query.
export const INBOX_SEARCH_DEBOUNCE_MS = 250;
