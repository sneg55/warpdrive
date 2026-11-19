export const PGBOSS_QUEUE_ACTIVITY_REMINDER = "activity.reminder";

export const REMINDER_LEAD_MINUTES = 10;
export const IMPORT_REMINDER_MIN_LEAD_MS = 60_000;

export const PGBOSS_QUEUE_EMAIL_SYNC = "email.sync";
export const PGBOSS_QUEUE_EMAIL_SEND = "email.send.process";

export const EMAIL_JOB_RETRY_LIMIT = 8;

export const PGBOSS_QUEUE_FILE_REAPER = "file.reaper";

export const EMAIL_NOTIFICATION_QUEUE = "notification.email";

export const PGBOSS_QUEUE_RELEASE_CHECK = "release.check";

export const PGBOSS_QUEUE_INTERCOM_SYNC = "intercom.sync";
export const PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH = "intercom.deal-search";
export const PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH_BACKFILL = "intercom.deal-search-backfill";
export const PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH_SWEEP = "intercom.deal-search-sweep";
export const PGBOSS_QUEUE_X_SYNC = "x.sync";
export const PGBOSS_QUEUE_X_CHAT_BACKFILL = "x-chat-backfill";

export const PGBOSS_QUEUE_IMPORT_PREPARE = "import.prepare";
export const PGBOSS_QUEUE_IMPORT_VALIDATE = "import.validate";
export const PGBOSS_QUEUE_IMPORT_COMMIT = "import.commit";
export const PGBOSS_QUEUE_IMPORT_UNDO = "import.undo";
export const IMPORT_JOB_TIMEOUT_MS = 5 * 60 * 1000;
