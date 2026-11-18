import { sql } from "drizzle-orm";
import type { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { ok, type Result } from "@/types/result";
import type { GmailClient } from "./gmailClient";
import { reconcileThreadTrash } from "./trashReconcile";

export async function sweepSpam(
  db: Db,
  args: { accountId: string; gmail: GmailClient; signal: AbortSignal },
): Promise<Result<{ hidden: number }, AppError>> {
  args.signal.throwIfAborted();

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

  const local = await db.execute(sql`
    SELECT gmail_thread_id FROM email_threads
    WHERE account_id = ${args.accountId}
      AND trashed_at IS NULL
      AND gmail_thread_id IN (
        SELECT jsonb_array_elements_text(${JSON.stringify([...spamThreadIds])}::jsonb)
      )
  `);
  args.signal.throwIfAborted();

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
