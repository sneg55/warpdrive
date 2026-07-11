import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";

// A conversation is trashed in WD iff EVERY Gmail message is in TRASH (a whole-thread trash), so
// trashing one message of a multi-message thread never hides the still-live conversation (P4).
export function isThreadFullyTrashed(messages: { labelIds: string[] }[]): boolean {
  return messages.length > 0 && messages.every((m) => m.labelIds.includes("TRASH"));
}

// Stamp trashed_at on one thread (only a fresh row, so a WD-initiated stamp is preserved). Used both
// for a fully-trashed conversation and for a purged thread (getThread 404: gone from Gmail, hide it).
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

// Set/clear trashed_at for one thread from its CURRENT Gmail message labels. Shared by the normal
// sync path (on a TRASH label change) and the 404 cursor-recovery path (which re-fetches linked
// threads), so both derive trashed_at identically. Stamp only a fresh row (idempotent, preserves a
// WD-initiated stamp); clear unconditionally on restore.
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
