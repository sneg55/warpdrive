import { sql } from "drizzle-orm";
import type { Job, PgBoss } from "pg-boss";
import { BACKOFF_START_MS, EMAIL_PROVIDER_KIND } from "@/constants/email";
import { AppError } from "@/constants/errorIds";
import { EMAIL_JOB_RETRY_LIMIT } from "@/constants/jobNames";
import {
  MILLISECONDS_PER_SECOND,
  TEAM_MAILBOX_BACKFILL_JOB_TIMEOUT_MS,
  TEAM_MAILBOX_BACKFILL_QUEUE,
} from "@/constants/teamMailbox";
import type { Db } from "@/db/client";
import { requireBoss } from "@/jobs/requireBoss";
import { ok, type Result } from "@/types/result";
import { recordBackfillFailure } from "./backfillFailure";
import { createBackfillThreadLister, type ListBackfillThreads } from "./gmailBackfill";
import { createGmailClient } from "./gmailClient";
import { makeRefresh } from "./gmailRefresh";
import { gmailProvider } from "./provider/gmailProvider";
import { resolveProvider } from "./provider/resolveProvider";
import type { MailProvider } from "./provider/types";
import { runTeamBackfillPage } from "./teamMailboxBackfill";
import { ensureAccessToken } from "./tokens";

export async function enqueuePendingBackfill(
  db: Db,
  accountId: string,
  enqueue: (id: string, signal: AbortSignal) => Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const rows =
    await db.execute(sql`SELECT 1 FROM email_accounts WHERE id=${accountId} AND kind='team'
    AND EXISTS (SELECT 1 FROM email_account_members WHERE account_id=${accountId})
    AND status<>'disconnected' AND (last_history_id IS NOT NULL OR provider_cursor IS NOT NULL) AND backfill_days IS NOT NULL AND backfill_status IS DISTINCT FROM 'done'`);
  signal.throwIfAborted();
  if (rows.rows.length > 0) await enqueue(accountId, signal);
}

export async function enqueueTeamBackfill(
  boss: PgBoss,
  accountId: string,
  signal: AbortSignal,
): Promise<void> {
  await boss.send(
    TEAM_MAILBOX_BACKFILL_QUEUE,
    { accountId },
    {
      singletonKey: accountId,
      retryLimit: EMAIL_JOB_RETRY_LIMIT,
      retryBackoff: true,
      retryDelay: Math.ceil(BACKOFF_START_MS / MILLISECONDS_PER_SECOND),
    },
  );
  signal.throwIfAborted();
}

const noBackfillThreads: ListBackfillThreads = () => Promise.resolve(ok({ threads: [] }));

export async function backfillSource(
  db: Db,
  accountId: string,
  signal: AbortSignal,
): Promise<Result<{ provider: MailProvider; listThreads: ListBackfillThreads }, AppError>> {
  const row = (await db.execute(sql`SELECT provider FROM email_accounts WHERE id=${accountId}`))
    .rows[0] as { provider: string } | undefined;
  signal.throwIfAborted();
  if (row?.provider === EMAIL_PROVIDER_KIND.agenticInbox) {
    const provider = await resolveProvider(db, accountId, signal);
    return provider.ok
      ? ok({ provider: provider.value, listThreads: noBackfillThreads })
      : provider;
  }
  const token = await ensureAccessToken(db, { accountId, deps: { refresh: makeRefresh(signal) } });
  if (!token.ok) return token;
  return ok({
    provider: gmailProvider(createGmailClient(token.value.token)),
    listThreads: createBackfillThreadLister(token.value.token),
  });
}

export async function registerTeamBackfillWorker(
  db: Db,
  boss: PgBoss,
  signal: AbortSignal,
): Promise<void> {
  await boss.createQueue(TEAM_MAILBOX_BACKFILL_QUEUE, { policy: "singleton" });
  signal.throwIfAborted();
  await boss.work(TEAM_MAILBOX_BACKFILL_QUEUE, async ([job]: Job<{ accountId: string }>[]) => {
    if (job === undefined) return;
    const signal = AbortSignal.timeout(TEAM_MAILBOX_BACKFILL_JOB_TIMEOUT_MS);
    const source = await backfillSource(db, job.data.accountId, signal);
    signal.throwIfAborted();
    if (!source.ok) {
      await recordBackfillFailure(db, job.data.accountId, source, signal);
      throw new AppError(source.error.id, "history import mailbox access unavailable", {});
    }
    const { provider, listThreads } = source.value;
    for (;;) {
      const result = await runTeamBackfillPage(db, {
        accountId: job.data.accountId,
        provider,
        listThreads,
        signal,
      });
      signal.throwIfAborted();
      if (!result.ok)
        throw new AppError(result.error.id, "history import failed", {
          accountId: job.data.accountId,
        });
      if (result.value.done) break;
    }
  });
  signal.throwIfAborted();
}

export async function schedulePendingBackfill(
  db: Db,
  accountId: string,
  signal: AbortSignal,
): Promise<void> {
  await enqueuePendingBackfill(
    db,
    accountId,
    async (id, signal) => {
      const boss = requireBoss();
      if (boss !== null) await enqueueTeamBackfill(boss, id, signal);
    },
    signal,
  );
}
