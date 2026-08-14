import { sql } from "drizzle-orm";
import type { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { ok, type Result } from "@/types/result";
import type { GmailClient } from "./gmailClient";
import { reconcileThreadTrash } from "./trashReconcile";

// One-off repair for spam that reached the CRM Inbox before the sync path learned to hide it.
// The sync path only reacts to history events, so a spam thread already sitting in email_threads is
// never re-examined and stays in the Inbox forever. This asks Gmail which conversations are in Spam
// and re-derives each one's hidden state from its CURRENT labels, using the same whole-thread rule
// as the sync path (reconcileThreadTrash), so a live conversation that merely contains one
// spam-flagged message is left visible.
//
// Safe to re-run: reconcileThreadTrash is idempotent and only ever mirrors Gmail's current state.
export async function sweepSpam(
  db: Db,
  args: { accountId: string; gmail: GmailClient; signal: AbortSignal },
): Promise<Result<{ hidden: number }, AppError>> {
  args.signal.throwIfAborted();

  // Pass 1: collect the Gmail thread ids currently in Spam (deduped; one thread yields many ids).
  const spamThreadIds = new Set<string>();
  let pageToken: string | undefined;
  do {
    const page = await args.gmail.listMessages({
      q: "in:spam",
      includeSpamTrash: true,
      pageToken,
      signal: args.signal,
    });
    args.signal.throwIfAborted();
    if (!page.ok) return page;
    for (const m of page.value.messages) {
      spamThreadIds.add(m.threadId);
    }
    pageToken = page.value.nextPageToken;
  } while (pageToken !== undefined);

  if (spamThreadIds.size === 0) return ok({ hidden: 0 });

  // Narrow to threads this mailbox actually synced and still shows: the spam folder is mostly junk
  // that never reached the CRM, and each survivor costs a getThread call.
  const local = await db.execute(sql`
    SELECT gmail_thread_id FROM email_threads
    WHERE account_id = ${args.accountId}
      AND trashed_at IS NULL
      AND gmail_thread_id IN (
        SELECT jsonb_array_elements_text(${JSON.stringify([...spamThreadIds])}::jsonb)
      )
  `);
  args.signal.throwIfAborted();

  // Pass 2: re-derive each candidate's hidden state from the whole conversation's labels.
  let hidden = 0;
  for (const row of local.rows as { gmail_thread_id: string }[]) {
    const thread = await args.gmail.getThread({ id: row.gmail_thread_id, signal: args.signal });
    args.signal.throwIfAborted();
    if (!thread.ok) return thread;
    await reconcileThreadTrash(db, args.accountId, row.gmail_thread_id, thread.value.messages);
    args.signal.throwIfAborted();
    const stamped = await db.execute(sql`
      SELECT 1 FROM email_threads
      WHERE account_id = ${args.accountId}
        AND gmail_thread_id = ${row.gmail_thread_id}
        AND trashed_at IS NOT NULL
    `);
    if (stamped.rows.length > 0) hidden += 1;
  }

  return ok({ hidden });
}
