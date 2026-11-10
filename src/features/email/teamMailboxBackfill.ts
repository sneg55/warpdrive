import { sql } from "drizzle-orm";
import type { AppError } from "@/constants/errorIds";
import { MILLISECONDS_PER_DAY, MILLISECONDS_PER_SECOND } from "@/constants/teamMailbox";
import type { Db } from "@/db/client";
import { ok, type Result } from "@/types/result";
import { applyMessageIds } from "./applyMessages";
import type { ListBackfillThreads } from "./gmailBackfill";
import type { GmailClient } from "./gmailClient";

export async function runTeamBackfillPage(
  db: Db,
  args: {
    accountId: string;
    gmail: GmailClient;
    listThreads: ListBackfillThreads;
    signal: AbortSignal;
  },
): Promise<Result<{ done: boolean }, AppError>> {
  const { accountId, gmail, signal } = args;
  signal.throwIfAborted();
  const rows =
    await db.execute(sql`SELECT backfill_days, backfill_status, backfill_page_token, last_history_id
    FROM email_accounts WHERE id=${accountId} AND kind='team' AND status<>'disconnected'
    AND EXISTS (SELECT 1 FROM email_account_members WHERE account_id=${accountId})`);
  signal.throwIfAborted();
  const account = rows.rows[0] as
    | {
        backfill_days: number | null;
        backfill_status: string | null;
        backfill_page_token: string | null;
        last_history_id: string | null;
      }
    | undefined;
  if (account === undefined || account.backfill_days === null || account.backfill_status === "done")
    return ok({ done: true });
  if (account.last_history_id === null) {
    const profile = await gmail.getProfile({ signal });
    if (!profile.ok) return recordBackfillFailure(db, accountId, profile, signal);
    await db.execute(
      sql`UPDATE email_accounts SET last_history_id=${profile.value.historyId}, backfill_started_at=COALESCE(backfill_started_at, now()) WHERE id=${accountId} AND last_history_id IS NULL`,
    );
    signal.throwIfAborted();
  }
  const started = (
    await db.execute(
      sql`UPDATE email_accounts SET backfill_status='running', backfill_error_id=NULL, backfill_started_at=COALESCE(backfill_started_at, now()) WHERE id=${accountId} RETURNING backfill_started_at`,
    )
  ).rows[0] as { backfill_started_at: string };
  signal.throwIfAborted();
  const startedAt = new Date(started.backfill_started_at);
  const cutoff = Math.floor(
    (startedAt.getTime() - account.backfill_days * MILLISECONDS_PER_DAY) / MILLISECONDS_PER_SECOND,
  );
  const page = await args.listThreads({
    q: `in:inbox -in:spam -in:trash after:${cutoff}`,
    pageToken: account.backfill_page_token ?? undefined,
    signal,
  });
  if (!page.ok) return recordBackfillFailure(db, accountId, page, signal);
  for (const thread of page.value.threads) {
    const fetched = await gmail.getThread({ id: thread.id, signal });
    if (!fetched.ok) return recordBackfillFailure(db, accountId, fetched, signal);
    if (!fetched.value.messages.some((message) => message.labelIds.includes("INBOX"))) continue;
    const ids = fetched.value.messages
      .filter(
        (message) => !message.labelIds.includes("SPAM") && !message.labelIds.includes("TRASH"),
      )
      .map((message) => message.id);
    const applied = await applyMessageIds(
      { db, accountId, gmail, signal, importedAt: startedAt },
      ids,
    );
    if (!applied.ok) return recordBackfillFailure(db, accountId, applied, signal);
  }
  const done = page.value.nextPageToken === undefined;
  await db.execute(
    sql`UPDATE email_accounts SET backfill_page_token=${page.value.nextPageToken ?? null}, backfill_status=${done ? "done" : "running"}, backfill_error_id=NULL WHERE id=${accountId}`,
  );
  signal.throwIfAborted();
  return ok({ done });
}

export async function recordBackfillFailure(
  db: Db,
  accountId: string,
  failure: { ok: false; error: AppError },
  signal: AbortSignal,
): Promise<{ ok: false; error: AppError }> {
  await db.execute(
    sql`UPDATE email_accounts SET backfill_status='failed', backfill_error_id=${failure.error.id} WHERE id=${accountId}`,
  );
  signal.throwIfAborted();
  return failure;
}
