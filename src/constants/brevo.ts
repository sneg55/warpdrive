export const BREVO_BASE_URL = "https://api.brevo.com/v3";
export const BREVO_API_KEY_HEADER = "api-key";
export const BREVO_RATE_LIMIT_RESET_HEADER = "x-sib-ratelimit-reset";
export const BREVO_NOT_FOUND_CODE = "document_not_found";

export const BREVO_REQUESTS_PER_SECOND = 5;
export const BREVO_MAX_RATE_LIMIT_RETRIES = 5;
export const BREVO_BACKOFF_BASE_MS = 1_000;
export const BREVO_BACKOFF_MAX_MS = 60_000;
export const BREVO_REQUEST_TIMEOUT_MS = 20_000;

export const BREVO_HISTORY_START = "2025-09-29";
export const BREVO_WINDOW_DAYS = 90;
export const BREVO_OVERLAP_DAYS = 89;

export const BREVO_CATALOG_PAGE_SIZE = 100;
export const BREVO_CATALOG_MAX_PAGES = 100;

export const BREVO_SYNC_CRON = "*/30 * * * *";
export const BREVO_SYNC_RUN_TIMEOUT_MS = 10 * 60 * 1000;
export const BREVO_SYNC_START_BUDGET_MS = 8 * 60 * 1000;
export const BREVO_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const BREVO_NOT_FOUND_RETRY_MS = 7 * 24 * 60 * 60 * 1000;
export const BREVO_PICK_BATCH = 200;

export const BREVO_READ_TIMEOUT_MS = 15_000;
export const BREVO_TIMELINE_LIMIT = 500;
export const BREVO_HISTORY_ID_PREFIX = "brevo-";
