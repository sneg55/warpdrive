import { sql } from "drizzle-orm";
import { AGENTIC_CHANGES_PAGE_LIMIT } from "@/constants/email";
import type { AppError } from "@/constants/errorIds";
import { MILLISECONDS_PER_DAY } from "@/constants/teamMailbox";
import type { Db } from "@/db/client";
import { ok, type Result } from "@/types/result";
import { importableRows } from "./agenticSync";
import { applyParsedMessages } from "./applyMessages";
import { recordBackfillFailure } from "./backfillFailure";
import type { AgenticClient } from "./provider/agenticClient";
import type { MailProvider } from "./provider/types";

interface BackfillState {
  provider_cursor: string | number | null;
  email_address: string;
}

export async function backfillAgenticMailbox(
  db: Db,
  args: {
    accountId: string;
    provider: MailProvider;
    client: AgenticClient;
    sinceDays: number;
    signal: AbortSignal;
  },
): Promise<Result<{ done: boolean }, AppError>> {
  const { accountId, client, signal } = args;
  signal.throwIfAborted();
  const acct = (
    await db.execute(
      sql`SELECT provider_cursor, email_address FROM email_accounts WHERE id=${accountId}`,
    )
  ).rows[0] as BackfillState | undefined;
  signal.throwIfAborted();
  if (acct === undefined) return ok({ done: true });
  if (acct.provider_cursor === null) {
    const head = await client.head(signal);
    signal.throwIfAborted();
    if (!head.ok) return recordBackfillFailure(db, accountId, head, signal);
    await db.execute(
      sql`UPDATE email_accounts SET provider_cursor=${head.value}, backfill_started_at=COALESCE(backfill_started_at, now()) WHERE id=${accountId} AND provider_cursor IS NULL`,
    );
    signal.throwIfAborted();
  }
  const started = (
    await db.execute(
      sql`UPDATE email_accounts SET backfill_status='running', backfill_error_id=NULL, backfill_started_at=COALESCE(backfill_started_at, now()) WHERE id=${accountId} RETURNING backfill_started_at, backfill_page_token`,
    )
  ).rows[0] as { backfill_started_at: string; backfill_page_token: string | null };
  signal.throwIfAborted();
  const startedAt = new Date(started.backfill_started_at);
  const cutoff = startedAt.getTime() - args.sinceDays * MILLISECONDS_PER_DAY;
  const after = Number(started.backfill_page_token ?? 0);

  const page = await client.changes({ after, limit: AGENTIC_CHANGES_PAGE_LIMIT, signal });
  signal.throwIfAborted();
  if (!page.ok) return recordBackfillFailure(db, accountId, page, signal);
  const rows = importableRows(
    page.value.emails,
    acct.email_address,
    (parsed) => parsed.sentAt !== null && parsed.sentAt.getTime() > cutoff,
  );
  const applied = await applyParsedMessages({ db, accountId, signal, importedAt: startedAt }, rows);
  if (!applied.ok) return recordBackfillFailure(db, accountId, applied, signal);

  const done = page.value.emails.length < AGENTIC_CHANGES_PAGE_LIMIT || page.value.cursor <= after;
  await db.execute(
    sql`UPDATE email_accounts SET backfill_page_token=${done ? null : String(page.value.cursor)}, backfill_status=${done ? "done" : "running"}, backfill_error_id=NULL WHERE id=${accountId}`,
  );
  signal.throwIfAborted();
  return ok({ done });
}
