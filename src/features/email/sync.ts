import { sql } from "drizzle-orm";
import type { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { ok, type Result } from "@/types/result";
import { applyMessageIds } from "./applyMessages";
import type { GmailClient } from "./gmailClient";
import type { HistoryList } from "./gmailSchemas";
import { recoverFrom404 } from "./resync";
import { hydrateOwner } from "./syncCursor";
import { markThreadTrashed, reconcileThreadTrash } from "./trashReconcile";

// Collect the unique gmail message ids added in a history page (idempotent: a page
// can redeliver, and the same id can appear across deltas).
function addedMessageIds(page: HistoryList): string[] {
  const ids = new Set<string>();
  for (const h of page.history) {
    for (const added of h.messagesAdded ?? []) {
      ids.add(added.message.id);
    }
  }
  return [...ids];
}

// Gmail thread ids whose TRASH state MAY have changed in this page: a message gained (delete) or
// lost (restore) the TRASH label. This is only a re-evaluation trigger, not the decision: Gmail
// trashes per MESSAGE, so a single-message trash in a multi-message conversation also fires here,
// yet the conversation is still live. The whole-thread state is decided below via getThread (P4).
function threadsWithTrashSignal(page: HistoryList): string[] {
  const ids = new Set<string>();
  for (const h of page.history) {
    for (const la of h.labelsAdded ?? []) {
      if (la.labelIds.includes("TRASH")) ids.add(la.message.threadId);
    }
    for (const lr of h.labelsRemoved ?? []) {
      if (lr.labelIds.includes("TRASH")) ids.add(lr.message.threadId);
    }
  }
  return [...ids];
}

// Reflect a Gmail-side TRASH change into trashed_at. For each signalled thread, re-fetch it and let
// reconcileThreadTrash decide from the whole conversation's labels (all-TRASH -> trashed, else
// cleared), so trashing one message of a multi-message thread never hides the live conversation and
// a restore clears the flag. A getThread 404 means the thread was purged (permanently deleted) from
// Gmail: mark it trashed and advance rather than wedging the cursor on a non-retryable error. Other
// (transient) getThread failures abort the page so the next tick retries.
async function applyTrashTransitions(
  db: Db,
  accountId: string,
  threadIds: Iterable<string>,
  gmail: GmailClient,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  for (const gmailThreadId of threadIds) {
    const thread = await gmail.getThread({ id: gmailThreadId, signal });
    if (!thread.ok) {
      if (thread.error.context?.status === 404) {
        await markThreadTrashed(db, accountId, gmailThreadId);
        signal.throwIfAborted();
        continue;
      }
      return thread;
    }
    await reconcileThreadTrash(db, accountId, gmailThreadId, thread.value.messages);
    signal.throwIfAborted();
  }
  return ok(undefined);
}

// Apply one history page: add new messages, then reflect Gmail-side trash state. The re-evaluation
// set is every thread the page touched: a TRASH label change (labelsAdded/Removed=TRASH) OR a
// message addition (which can trash a thread, e.g. a filtered auto-delete, or un-trash it, e.g. a
// reply landing back in the inbox). Idempotent: a redelivered page yields the same count (ON
// CONFLICT DO NOTHING) and re-derives the same trashed_at from the current thread state.
export async function applyHistoryPage(args: {
  db: Db;
  accountId: string;
  owner: AuthUser;
  page: HistoryList;
  gmail: GmailClient;
  signal: AbortSignal;
}): Promise<Result<number, AppError>> {
  const touched = new Set<string>(threadsWithTrashSignal(args.page));
  const applied = await applyMessageIds(
    {
      db: args.db,
      accountId: args.accountId,
      owner: args.owner,
      gmail: args.gmail,
      signal: args.signal,
      touchedThreadIds: touched,
    },
    addedMessageIds(args.page),
  );
  if (!applied.ok) return applied;
  const trashed = await applyTrashTransitions(
    args.db,
    args.accountId,
    touched,
    args.gmail,
    args.signal,
  );
  if (!trashed.ok) return trashed;
  return applied;
}

// Re-export so callers that previously imported applyMessageIds from here still work.
export { applyMessageIds } from "./applyMessages";

// Drive an incremental sync from the OLD cursor through every nextPageToken page,
// committing ONE checkpoint at the end. A mid-sync failure leaves the cursor at the
// old position so the next run re-drives idempotently (at-least-once + idempotent =
// exactly-once effect). A 404 (expired cursor) triggers recoverFrom404.
export async function syncMailbox(
  db: Db,
  args: { accountId: string; gmail: GmailClient; signal: AbortSignal },
): Promise<Result<{ applied: number }, AppError>> {
  args.signal.throwIfAborted();
  const acctRow = await db.execute(
    sql`SELECT last_history_id, status, user_id FROM email_accounts WHERE id=${args.accountId}`,
  );
  const acct = acctRow.rows[0] as
    | { last_history_id: string | null; status: string; user_id: string }
    | undefined;
  if (acct === undefined || acct.status === "disconnected") return ok({ applied: 0 });
  const startHistoryId = acct.last_history_id;
  if (startHistoryId === null) {
    // First run after connect: the mailbox has no cursor yet. Seed it from the mailbox's
    // current historyId so subsequent ticks poll deltas go-forward. Nothing else seeds this
    // (there is no separate bootstrap step), so without it every tick no-ops on the null
    // cursor and the mailbox never syncs. Historical backfill is intentionally out of scope:
    // incremental polling starts from now. A profile-fetch failure leaves the cursor null so
    // the next tick retries.
    const profile = await args.gmail.getProfile({ signal: args.signal });
    if (!profile.ok) return profile;
    await db.execute(sql`
      UPDATE email_accounts
      SET last_history_id=${profile.value.historyId}, last_sync_at=now(), last_error_id=NULL
      WHERE id=${args.accountId}
    `);
    args.signal.throwIfAborted();
    return ok({ applied: 0 });
  }

  const owner = await hydrateOwner(db, acct.user_id, args.signal);
  if (!owner.ok) return owner;

  let pageToken: string | undefined;
  let newHistoryId = startHistoryId;
  let applied = 0;
  do {
    const page = await args.gmail.historyList({ startHistoryId, pageToken, signal: args.signal });
    args.signal.throwIfAborted();
    if (!page.ok) {
      if (page.error.context?.status === 404) {
        return recoverFrom404(db, {
          accountId: args.accountId,
          gmail: args.gmail,
          signal: args.signal,
        });
      }
      return page; // cursor NOT advanced
    }

    const ap = await applyHistoryPage({
      db,
      accountId: args.accountId,
      owner: owner.value,
      page: page.value,
      gmail: args.gmail,
      signal: args.signal,
    });
    if (!ap.ok) return ap; // partial failure: cursor NOT advanced
    applied += ap.value;
    newHistoryId = page.value.historyId;
    pageToken = page.value.nextPageToken;
  } while (pageToken !== undefined);

  // Single checkpoint AFTER the last page committed.
  await db.execute(sql`
    UPDATE email_accounts
    SET last_history_id=${newHistoryId}, last_sync_at=now(), last_error_id=NULL
    WHERE id=${args.accountId}
  `);
  args.signal.throwIfAborted();
  return ok({ applied });
}
