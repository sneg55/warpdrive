import { sql } from "drizzle-orm";
import { RESYNC_WINDOW_MARGIN_SECONDS } from "@/constants/email";
import type { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { ok, type Result } from "@/types/result";
import { applyMessageIds } from "./applyMessages";
import type { GmailClient } from "./gmailClient";
import { hydrateOwner } from "./syncCursor";
import { reconcileThreadTrash } from "./trashReconcile";

// Full ops-B3 gap recovery. Called when historyList returns 404 (expired cursor).
// Invariant: cursor advances ONLY after coverage is complete. If any step fails,
// status stays 'error' and last_history_id is unchanged so the next tick re-drives.
export async function recoverFrom404(
  db: Db,
  args: { accountId: string; gmail: GmailClient; signal: AbortSignal },
): Promise<Result<{ applied: number }, AppError>> {
  args.signal.throwIfAborted();

  // Load account row.
  const acctRow = await db.execute(
    sql`SELECT last_sync_at, status, user_id FROM email_accounts WHERE id=${args.accountId}`,
  );
  args.signal.throwIfAborted();
  const acct = acctRow.rows[0] as
    | { last_sync_at: Date | null; status: string; user_id: string }
    | undefined;

  // Disconnected accounts are not recovered (no consent to access mailbox).
  if (acct === undefined || acct.status === "disconnected") {
    return ok({ applied: 0 });
  }

  // Mark sync-gap: cursor PRESERVED, status set to 'error' so UI surfaces it.
  await db.execute(sql`
    UPDATE email_accounts
    SET status='error', last_error_id='E_SYNC_001'
    WHERE id=${args.accountId}
  `);
  args.signal.throwIfAborted();

  const ownerResult = await hydrateOwner(db, acct.user_id, args.signal);
  if (!ownerResult.ok) return ownerResult;
  const owner = ownerResult.value;

  // Build query: safety margin so replies at the boundary are not missed.
  let q: string | undefined;
  if (acct.last_sync_at !== null) {
    const lastSyncMs = new Date(acct.last_sync_at).getTime();
    q = `after:${Math.floor(lastSyncMs / 1000) - RESYNC_WINDOW_MARGIN_SECONDS}`;
  }
  // If last_sync_at is null: full-mailbox fallback (q stays undefined).

  // Coverage = recent-window backfill UNION every CRM-linked thread's messages.
  // The window alone keys on message date, so a reply whose internalDate predates
  // the window (e.g. a label-only change on an old thread) would slip through; the
  // explicit thread re-fetch closes that gap (ops B3, spec lines 372-373).
  const ids = new Set<string>();

  // Pass 1: page through the recent-window listMessages, collecting ids (deduped).
  let pageToken: string | undefined;
  do {
    const listResult = await args.gmail.listMessages({ q, pageToken, signal: args.signal });
    args.signal.throwIfAborted();
    if (!listResult.ok) return listResult; // NO cursor advance
    for (const m of listResult.value.messages) {
      ids.add(m.id);
    }
    pageToken = listResult.value.nextPageToken;
  } while (pageToken !== undefined);

  // Pass 2: re-fetch every CRM-linked thread for this mailbox and union its message
  // ids in. Already-applied ids are no-ops downstream (ON CONFLICT DO NOTHING).
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
    if (!threadResult.ok) return threadResult; // NO cursor advance
    for (const m of threadResult.value.messages) {
      ids.add(m.id);
    }
    // Reconcile trashed_at from the thread's CURRENT labels: a trash/restore that happened while the
    // cursor was stale is otherwise missed here (the history deltas are gone). Uses the same
    // whole-thread rule as the normal sync path (P4).
    await reconcileThreadTrash(
      db,
      args.accountId,
      row.gmail_thread_id,
      threadResult.value.messages,
    );
    args.signal.throwIfAborted();
  }

  // Apply all collected ids. On failure: status stays 'error', cursor not advanced.
  const ap = await applyMessageIds(
    { db, accountId: args.accountId, owner, gmail: args.gmail, signal: args.signal },
    [...ids],
  );
  if (!ap.ok) return ap;

  // Fetch the current cursor from Gmail AFTER coverage is complete.
  const profileResult = await args.gmail.getProfile({ signal: args.signal });
  args.signal.throwIfAborted();
  if (!profileResult.ok) return profileResult; // NO cursor advance

  // Coverage complete: advance cursor and clear error state.
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
