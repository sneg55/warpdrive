import { sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { err, ok, type Result } from "@/types/result";
import type { GmailClient } from "./gmailClient";
import { mailboxAccessPredicate } from "./mailboxAccess";

export async function trashThread(
  db: Db,
  args: { actor: AuthUser; threadId: string; gmail: GmailClient },
  signal: AbortSignal,
): Promise<Result<{ threadId: string }, AppError>> {
  signal.throwIfAborted();
  const row = (
    await db.execute(sql`
      SELECT t.id, t.gmail_thread_id
      FROM email_threads t JOIN email_accounts a ON a.id = t.account_id
      WHERE t.id = ${args.threadId} AND ${mailboxAccessPredicate(args.actor.id)}
    `)
  ).rows[0] as { id: string; gmail_thread_id: string } | undefined;
  signal.throwIfAborted();
  if (row === undefined)
    return err(new AppError(ERROR_IDS.GMAIL_THREAD_NOT_FOUND, "thread not found", {}));

  const trashed = await args.gmail.trashThread({ threadId: row.gmail_thread_id, signal });
  signal.throwIfAborted();
  if (!trashed.ok) return trashed;

  await db.execute(sql`UPDATE email_threads SET trashed_at = now() WHERE id = ${row.id}`);
  signal.throwIfAborted();
  return ok({ threadId: row.id });
}
