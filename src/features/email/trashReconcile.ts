import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";

const HIDDEN_LABELS = ["TRASH", "SPAM"] as const;

function isThreadFullyTrashed(messages: { labelIds: string[] }[]): boolean {
  return (
    messages.length > 0 &&
    messages.every((m) => HIDDEN_LABELS.some((label) => m.labelIds.includes(label)))
  );
}

export async function markThreadTrashed(
  db: Db,
  accountId: string,
  gmailThreadId: string,
): Promise<void> {
  await db.execute(sql`
    UPDATE email_threads SET trashed_at = now()
    WHERE account_id = ${accountId} AND trashed_at IS NULL AND gmail_thread_id = ${gmailThreadId}
  `);
}

export async function reconcileThreadTrash(
  db: Db,
  accountId: string,
  gmailThreadId: string,
  messages: { labelIds: string[] }[],
): Promise<void> {
  if (isThreadFullyTrashed(messages)) {
    await markThreadTrashed(db, accountId, gmailThreadId);
    return;
  }
  await db.execute(sql`
    UPDATE email_threads SET trashed_at = NULL
    WHERE account_id = ${accountId} AND gmail_thread_id = ${gmailThreadId}
  `);
}
