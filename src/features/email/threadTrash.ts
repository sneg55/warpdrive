import { sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { err, ok, type Result } from "@/types/result";
import type { GmailClient } from "./gmailClient";

// Reader Delete -> Gmail Trash (P4). Resolves the thread owner-scoped (missing OR not-owned both
// return 404, matching archive/getThread), then moves the REAL Gmail conversation by its gmail
// thread id and only on success stamps trashed_at. Ordering matters: a Gmail failure must leave
// trashed_at null so we never local-delete a thread that is still live in Gmail, and a
// WD-initiated trash that succeeded is already gone in Gmail so the next sync's TRASH label is
// idempotent. The gmail client is injected so the domain is testable against the Fake.
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
      WHERE t.id = ${args.threadId} AND a.user_id = ${args.actor.id}
    `)
  ).rows[0] as { id: string; gmail_thread_id: string } | undefined;
  if (row === undefined)
    return err(new AppError(ERROR_IDS.GMAIL_THREAD_NOT_FOUND, "thread not found", {}));

  const trashed = await args.gmail.trashThread({ threadId: row.gmail_thread_id, signal });
  if (!trashed.ok) return trashed;

  await db.execute(sql`UPDATE email_threads SET trashed_at = now() WHERE id = ${row.id}`);
  signal.throwIfAborted();
  return ok({ threadId: row.id });
}
