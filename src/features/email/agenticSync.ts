import { sql } from "drizzle-orm";
import { AGENTIC_CHANGES_PAGE_LIMIT, AGENTIC_UNIMPORTED_FOLDERS } from "@/constants/email";
import type { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { ok, type Result } from "@/types/result";
import { applyParsedMessages } from "./applyMessages";
import type { ParsedMessage } from "./mimeParse";
import type { AgenticClient } from "./provider/agenticClient";
import { agenticParse } from "./provider/agenticParse";
import type { ChangeEmail } from "./provider/agenticSchemas";
import type { MailProvider } from "./provider/types";

interface SyncArgs {
  accountId: string;
  provider: MailProvider;
  client: AgenticClient;
  signal: AbortSignal;
}

export function importableRows(
  emails: ChangeEmail[],
  mailbox: string,
  keep: (parsed: ParsedMessage) => boolean = () => true,
): ParsedMessage[] {
  return emails
    .filter((e) => !AGENTIC_UNIMPORTED_FOLDERS.includes(e.folder))
    .map((e) => agenticParse(e, mailbox))
    .filter(keep);
}

async function seedAgenticCursor(
  db: Db,
  args: { accountId: string; client: AgenticClient; signal: AbortSignal },
): Promise<Result<void, AppError>> {
  const head = await args.client.head(args.signal);
  args.signal.throwIfAborted();
  if (!head.ok) return head;
  await db.execute(sql`
    UPDATE email_accounts
    SET provider_cursor=${head.value}, last_sync_at=now(), last_error_id=NULL,
        backfill_started_at=CASE WHEN kind='team' THEN COALESCE(backfill_started_at, now()) ELSE backfill_started_at END
    WHERE id=${args.accountId} AND provider_cursor IS NULL
  `);
  args.signal.throwIfAborted();
  return ok(undefined);
}

export async function syncAgenticMailbox(
  db: Db,
  args: SyncArgs,
): Promise<Result<{ applied: number }, AppError>> {
  const { accountId, client, signal } = args;
  signal.throwIfAborted();
  const rows = await db.execute(
    sql`SELECT provider_cursor, status, email_address FROM email_accounts WHERE id=${accountId}`,
  );
  signal.throwIfAborted();
  const acct = rows.rows[0] as
    | { provider_cursor: string | number | null; status: string; email_address: string }
    | undefined;
  if (acct === undefined || acct.status === "disconnected") return ok({ applied: 0 });
  if (acct.provider_cursor === null) {
    const seeded = await seedAgenticCursor(db, { accountId, client, signal });
    return seeded.ok ? ok({ applied: 0 }) : seeded;
  }

  let after = Number(acct.provider_cursor);
  let applied = 0;
  for (;;) {
    const page = await client.changes({ after, limit: AGENTIC_CHANGES_PAGE_LIMIT, signal });
    signal.throwIfAborted();
    if (!page.ok) return page;
    const done = await applyParsedMessages(
      { db, accountId, signal },
      importableRows(page.value.emails, acct.email_address),
    );
    if (!done.ok) return done;
    applied += done.value;
    const advanced = page.value.cursor > after;
    after = Math.max(after, page.value.cursor);
    await db.execute(sql`UPDATE email_accounts SET provider_cursor=${after} WHERE id=${accountId}`);
    signal.throwIfAborted();
    if (page.value.emails.length < AGENTIC_CHANGES_PAGE_LIMIT || !advanced) break;
  }

  await db.execute(sql`
    UPDATE email_accounts SET last_sync_at=now(), last_error_id=NULL WHERE id=${accountId}
  `);
  signal.throwIfAborted();
  return ok({ applied });
}
