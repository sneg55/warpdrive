export const INTERCOM_API_VERSION = "2.11";

export const INTERCOM_REGION_HOSTS = {
  us: "https://api.intercom.io",
  eu: "https://api.eu.intercom.io",
  au: "https://api.au.intercom.io",
} as const;

export type IntercomRegion = keyof typeof INTERCOM_REGION_HOSTS;

export const INTERCOM_SEARCH_PER_PAGE = 150;
export const INTERCOM_CURSOR_OVERLAP_SECONDS = 300;
export const INTERCOM_BACKFILL_DAYS = 365;
export const INTERCOM_MAX_PAGES_PER_RUN = 20;
export const INTERCOM_DETAIL_CONCURRENCY = 20;
export const INTERCOM_CONTACT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INTERCOM_MAX_STALLED_RUNS = 12;
export const INTERCOM_CONTACT_REFRESH_BATCH = 200;
export const INTERCOM_INSERT_CHUNK_ROWS = 500;

export const INTERCOM_MAX_RATE_LIMIT_RETRIES = 5;
export const INTERCOM_BACKOFF_BASE_MS = 1_000;
export const INTERCOM_BACKOFF_MAX_MS = 60_000;

export const INTERCOM_SYNC_CRON = "*/5 * * * *";
export const INTERCOM_SYNC_RUN_TIMEOUT_MS = 4 * 60 * 1000;
export const INTERCOM_SYNC_PAGE_BUDGET_MS = 3 * 60 * 1000;
export const INTERCOM_READ_TIMEOUT_MS = 15_000;
export const INTERCOM_TIMELINE_LIMIT = 200;

export const INTERCOM_VISIBLE_PART_TYPES: readonly string[] = ["comment"];
export const INTERCOM_SOURCE_PART_TYPE = "source";
export const INTERCOM_SOURCE_PART_ID_PREFIX = "source-";
export const INTERCOM_SNIPPET_MAX_CHARS = 200;
export const INTERCOM_HISTORY_ID_PREFIX = "intercom-";
export const INTERCOM_OPEN_STATE = "open";

export const NOREPLY_LOCAL_PARTS: readonly string[] = [
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "mailer-daemon",
];
