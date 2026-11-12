// pg-boss queue names and scheduling constants.
export const PGBOSS_QUEUE_ACTIVITY_REMINDER = "activity.reminder";

// Minutes before an activity's dueAt that the reminder fires.
export const REMINDER_LEAD_MINUTES = 10;
export const IMPORT_REMINDER_MIN_LEAD_MS = 60_000;

// Email job queues are FIXED names (NOT per-account). Per-mailbox identity goes in the
// job DATA + singletonKey=accountId (dedups re-enqueues), so one queue serves all
// mailboxes and per-mailbox isolation is structural (each job is independent).
export const PGBOSS_QUEUE_EMAIL_SYNC = "email.sync";
export const PGBOSS_QUEUE_EMAIL_SEND = "email.send.process";

// Retry budget for transient Gmail failures (429/5xx) before a job is parked.
export const EMAIL_JOB_RETRY_LIMIT = 8;

export const PGBOSS_QUEUE_FILE_REAPER = "file.reaper";

// Notification email delivery: payload is { notificationId: string }.
// Task 7 registers the worker that consumes this queue.
export const EMAIL_NOTIFICATION_QUEUE = "notification.email";

// Self-hoster update check: poll GitHub for the latest release and cache it. Fixed queue name,
// cron-scheduled (see RELEASE_CHECK_CRON) plus one immediate run on worker boot. No payload.
export const PGBOSS_QUEUE_RELEASE_CHECK = "release.check";

export const PGBOSS_QUEUE_INTERCOM_SYNC = "intercom.sync";

// Import overhaul: four background phases, each its own queue (payload { batchId }),
// deduped by singletonKey = batchId.
export const PGBOSS_QUEUE_IMPORT_PREPARE = "import.prepare";
export const PGBOSS_QUEUE_IMPORT_VALIDATE = "import.validate";
export const PGBOSS_QUEUE_IMPORT_COMMIT = "import.commit";
export const PGBOSS_QUEUE_IMPORT_UNDO = "import.undo";
export const IMPORT_JOB_TIMEOUT_MS = 5 * 60 * 1000;
