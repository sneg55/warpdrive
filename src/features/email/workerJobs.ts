import { sql } from "drizzle-orm";
import type { Job, PgBoss } from "pg-boss";
import { BACKOFF_START_MS } from "@/constants/email";
import { AppError } from "@/constants/errorIds";
import {
  EMAIL_JOB_RETRY_LIMIT,
  PGBOSS_QUEUE_EMAIL_SEND,
  PGBOSS_QUEUE_EMAIL_SYNC,
} from "@/constants/jobNames";
import { db } from "@/db/client";
import { syncFailureDetail } from "./syncFailureDetail";
import { pendingTicksVia, reEnqueueSync } from "./syncReEnqueue";
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

// The sync failure the worker throws for pg-boss, and the one line that reports it. Both used to
// carry the accountId alone, so a mailbox that had been failing every tick for hours left an
// unexplained E_GMAIL_001 in the job record and NOTHING in the log. syncFailureDetail keeps the
// Gmail status, which is the difference between a throttle and a permanently bad request, and
// drops the response body, which holds the message.
export function syncJobError(accountId: string, cause: AppError): AppError {
  const detail = syncFailureDetail(cause);
  console.error("[email.sync] failed", { accountId, ...detail });
  return new AppError(cause.id, "email sync job failed", { accountId, ...detail });
}

// Register the email work handlers and enqueue the first per-mailbox sync jobs. NOT
// wired into startWorker here (that is Task 23); this only defines registration.
export async function registerEmailJobs(boss: PgBoss): Promise<void> {
  await boss.createQueue(PGBOSS_QUEUE_EMAIL_SYNC);
  await boss.createQueue(PGBOSS_QUEUE_EMAIL_SEND);
  const pendingTicks = pendingTicksVia(db);

  // Sync handler. pg-boss v12 passes an ARRAY of jobs; we process one at a time.
  await boss.work(PGBOSS_QUEUE_EMAIL_SYNC, async ([job]: Job<SyncJobData>[]) => {
    if (job === undefined) return;
    const accountId = job.data.accountId;
    const signal = AbortSignal.timeout(SYNC_JOB_TIMEOUT_MS);
    const r = await runSyncJob(db, { accountId, signal });
    // Keep the cadence going regardless of outcome, but never add a tick when one is already
    // waiting. singletonKey does NOT dedup here: pg-boss only enforces it on a queue whose policy
    // is short/singleton/stately/exclusive, and this queue is standard, so the bare re-enqueue
    // piled up ~45 overlapping ticks per mailbox and the backlog fed itself.
    await reEnqueueSync(boss, accountId, pendingTicks);
    // On failure THROW a sanitized AppError (id + accountId only, NO tokens) so pg-boss
    // applies its retry/backoff. runSyncJob already stamped last_error_id.
    if (!r.ok) throw syncJobError(accountId, r.error);
  });

  // Send handler. One outbox attempt per job; per-mailbox isolation is structural.
  await boss.work(PGBOSS_QUEUE_EMAIL_SEND, async ([job]: Job<SendJobData>[]) => {
    if (job === undefined) return;
    const { accountId, idempotencyKey } = job.data;
    const signal = AbortSignal.timeout(SEND_JOB_TIMEOUT_MS);
    const r = await runSendJob(db, { accountId, idempotencyKey, signal });
    if (!r.ok) {
      const detail = syncFailureDetail(r.error);
      console.error("[email.send] failed", { accountId, ...detail });
      throw new AppError(r.error.id, "email send job failed", { accountId, ...detail });
    }
  });

  // Enqueue the first sync job per connected mailbox, offset by jitter (no herd).
  const rows = (await db.execute(sql`SELECT id FROM email_accounts WHERE status <> 'disconnected'`))
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
