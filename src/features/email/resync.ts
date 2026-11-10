import { sql } from "drizzle-orm";
import { RESYNC_WINDOW_MARGIN_SECONDS } from "@/constants/email";
import type { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { ok, type Result } from "@/types/result";
import { applyMessageIds } from "./applyMessages";
import type { GmailClient } from "./gmailClient";

import { reconcileThreadTrash } from "./trashReconcile";

export async function recoverFrom404(
  db: Db,
  args: { accountId: string; gmail: GmailClient; signal: AbortSignal },
): Promise<Result<{ applied: number }, AppError>> {
  args.signal.throwIfAborted();

  const acctRow = await db.execute(
    sql`SELECT last_sync_at, status, user_id FROM email_accounts WHERE id=${args.accountId}`,
  );
  args.signal.throwIfAborted();
  const acct = acctRow.rows[0] as
    | { last_sync_at: Date | null; status: string; user_id: string }
    | undefined;

  if (acct === undefined || acct.status === "disconnected") {
    return ok({ applied: 0 });
  }

  await db.execute(sql`
    UPDATE email_accounts
    SET status='error', last_error_id='E_SYNC_001'
    WHERE id=${args.accountId}
  `);
  args.signal.throwIfAborted();

  let q: string | undefined;
  if (acct.last_sync_at !== null) {
    const lastSyncMs = new Date(acct.last_sync_at).getTime();
    q = `after:${Math.floor(lastSyncMs / 1000) - RESYNC_WINDOW_MARGIN_SECONDS}`;
  }

  const ids = new Set<string>();

  let pageToken: string | undefined;
  do {
    const listResult = await args.gmail.listMessages({ q, pageToken, signal: args.signal });
    args.signal.throwIfAborted();
    if (!listResult.ok) return listResult;
    for (const m of listResult.value.messages) {
      ids.add(m.id);
    }
    pageToken = listResult.value.nextPageToken;
  } while (pageToken !== undefined);

  const linkedThreads = await db.execute(
    sql`SELECT gmail_thread_id FROM email_threads
        WHERE account_id=${args.accountId}
          AND (person_id IS NOT NULL OR deal_id IS NOT NULL OR lead_id IS NOT NULL)`,
  );
  args.signal.throwIfAborted();
  for (const row of linkedThreads.rows as { gmail_thread_id: string }[]) {
    const threadResult = await args.gmail.getThread({
      id: row.gmail_thread_id,
      signal: args.signal,
    });
    args.signal.throwIfAborted();
    if (!threadResult.ok) return threadResult;
    for (const m of threadResult.value.messages) {
      ids.add(m.id);
    }
    await reconcileThreadTrash(
      db,
      args.accountId,
      row.gmail_thread_id,
      threadResult.value.messages,
    );
    args.signal.throwIfAborted();
  }

  const ap = await applyMessageIds(
    { db, accountId: args.accountId, gmail: args.gmail, signal: args.signal },
    [...ids],
  );
  if (!ap.ok) return ap;

  const profileResult = await args.gmail.getProfile({ signal: args.signal });
  args.signal.throwIfAborted();
  if (!profileResult.ok) return profileResult;

  await db.execute(sql`
    UPDATE email_accounts
    SET last_history_id=${profileResult.value.historyId},
        status='connected',
        last_error_id=NULL,
        last_sync_at=now()
    WHERE id=${args.accountId}
  `);
  args.signal.throwIfAborted();

  return ok({ applied: ap.value });
}
