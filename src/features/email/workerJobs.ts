import { sql } from "drizzle-orm";
import type { Job, PgBoss } from "pg-boss";
import { BACKOFF_START_MS, SYNC_CADENCE_SECONDS } from "@/constants/email";
import { AppError } from "@/constants/errorIds";
import {
  EMAIL_JOB_RETRY_LIMIT,
  PGBOSS_QUEUE_EMAIL_SEND,
  PGBOSS_QUEUE_EMAIL_SYNC,
} from "@/constants/jobNames";
import { db } from "@/db/client";
import { jitterFor, runSendJob, runSyncJob } from "./worker";

interface SyncJobData {
  accountId: string;
}
interface SendJobData {
  accountId: string;
  idempotencyKey: string;
}

const RETRY_DELAY_SECONDS = Math.ceil(BACKOFF_START_MS / 1000);
const SYNC_JOB_TIMEOUT_MS = 60_000;
const SEND_JOB_TIMEOUT_MS = 30_000;

// Re-enqueue the next sync tick for a mailbox. Sub-minute cadence is not expressible as
// cron, so the handler self-re-enqueues after each run (ok or not) to keep the ~90s
// cadence. singletonKey=accountId dedups, so a re-enqueue never piles up duplicates.
async function reEnqueueSync(boss: PgBoss, accountId: string): Promise<void> {
  await boss.send(
    PGBOSS_QUEUE_EMAIL_SYNC,
    { accountId },
    { startAfter: SYNC_CADENCE_SECONDS, singletonKey: accountId },
  );
}

// Register the email work handlers and enqueue the first per-mailbox sync jobs. NOT
// wired into startWorker here (that is Task 23); this only defines registration.
export async function registerEmailJobs(boss: PgBoss): Promise<void> {
  await boss.createQueue(PGBOSS_QUEUE_EMAIL_SYNC);
  await boss.createQueue(PGBOSS_QUEUE_EMAIL_SEND);

  // Sync handler. pg-boss v12 passes an ARRAY of jobs; we process one at a time.
  await boss.work(PGBOSS_QUEUE_EMAIL_SYNC, async ([job]: Job<SyncJobData>[]) => {
    if (job === undefined) return;
    const accountId = job.data.accountId;
    const signal = AbortSignal.timeout(SYNC_JOB_TIMEOUT_MS);
    const r = await runSyncJob(db, { accountId, signal });
    // Keep the cadence going regardless of outcome (singletonKey dedups).
    await reEnqueueSync(boss, accountId);
    // On failure THROW a sanitized AppError (id + accountId only, NO tokens) so pg-boss
    // applies its retry/backoff. runSyncJob already stamped last_error_id.
    if (!r.ok) throw new AppError(r.error.id, "email sync job failed", { accountId });
  });

  // Send handler. One outbox attempt per job; per-mailbox isolation is structural.
  await boss.work(PGBOSS_QUEUE_EMAIL_SEND, async ([job]: Job<SendJobData>[]) => {
    if (job === undefined) return;
    const { accountId, idempotencyKey } = job.data;
    const signal = AbortSignal.timeout(SEND_JOB_TIMEOUT_MS);
    const r = await runSendJob(db, { accountId, idempotencyKey, signal });
    if (!r.ok) throw new AppError(r.error.id, "email send job failed", { accountId });
  });

  // Enqueue the first sync job per connected mailbox, offset by jitter (no herd).
  const rows = (await db.execute(sql`SELECT id FROM email_accounts WHERE status='connected'`))
    .rows as { id: string }[];
  for (const row of rows) {
    await boss.send(
      PGBOSS_QUEUE_EMAIL_SYNC,
      { accountId: row.id },
      {
        startAfter: jitterFor(row.id),
        singletonKey: row.id,
        retryLimit: EMAIL_JOB_RETRY_LIMIT,
        retryBackoff: true,
        retryDelay: RETRY_DELAY_SECONDS,
      },
    );
  }
}
