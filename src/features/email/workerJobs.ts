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
import {
  enqueuePendingBackfill,
  enqueueTeamBackfill,
  registerTeamBackfillWorker,
} from "./teamBackfillJobs";
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

export function syncJobError(accountId: string, cause: AppError): AppError {
  const detail = syncFailureDetail(cause);
  console.error("[email.sync] failed", { accountId, ...detail });
  return new AppError(cause.id, "email sync job failed", { accountId, ...detail });
}

export async function registerEmailJobs(boss: PgBoss): Promise<void> {
  await registerTeamBackfillWorker(db, boss, new AbortController().signal);
  await boss.createQueue(PGBOSS_QUEUE_EMAIL_SYNC);
  await boss.createQueue(PGBOSS_QUEUE_EMAIL_SEND);
  const pendingTicks = pendingTicksVia(db);

  await boss.work(PGBOSS_QUEUE_EMAIL_SYNC, async ([job]: Job<SyncJobData>[]) => {
    if (job === undefined) return;
    const accountId = job.data.accountId;
    const signal = AbortSignal.timeout(SYNC_JOB_TIMEOUT_MS);
    const r = await runSyncJob(db, { accountId, signal });
    await reEnqueueSync(boss, accountId, pendingTicks);
    if (!r.ok) throw syncJobError(accountId, r.error);
    await enqueuePendingBackfill(
      db,
      accountId,
      (id, signal) => enqueueTeamBackfill(boss, id, signal),
      signal,
    );
  });

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
