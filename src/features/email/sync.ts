import { sql } from "drizzle-orm";
import type { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";

import { ok, type Result } from "@/types/result";
import { applyMessageIds } from "./applyMessages";
import type { GmailClient } from "./gmailClient";
import type { HistoryList } from "./gmailSchemas";
import { recoverFrom404 } from "./resync";

import { markThreadTrashed, reconcileThreadTrash } from "./trashReconcile";

function addedMessageIds(page: HistoryList): string[] {
  const ids = new Set<string>();
  for (const h of page.history) {
    for (const added of h.messagesAdded ?? []) {
      ids.add(added.message.id);
    }
  }
  return [...ids];
}

const HIDING_LABELS = ["TRASH", "SPAM"];

function threadsWithTrashSignal(page: HistoryList): string[] {
  const ids = new Set<string>();
  const changed = (labelIds: string[]): boolean => HIDING_LABELS.some((l) => labelIds.includes(l));
  for (const h of page.history) {
    for (const la of h.labelsAdded ?? []) {
      if (changed(la.labelIds)) ids.add(la.message.threadId);
    }
    for (const lr of h.labelsRemoved ?? []) {
      if (changed(lr.labelIds)) ids.add(lr.message.threadId);
    }
  }
  return [...ids];
}

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

async function applyHistoryPage(args: {
  db: Db;
  accountId: string;
  page: HistoryList;
  gmail: GmailClient;
  signal: AbortSignal;
}): Promise<Result<number, AppError>> {
  const touched = new Set<string>(threadsWithTrashSignal(args.page));
  const applied = await applyMessageIds(
    {
      db: args.db,
      accountId: args.accountId,
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
    const profile = await args.gmail.getProfile({ signal: args.signal });
    if (!profile.ok) return profile;
    await db.execute(sql`
      UPDATE email_accounts
      SET last_history_id=${profile.value.historyId}, last_sync_at=now(), last_error_id=NULL,
          backfill_started_at=CASE WHEN kind='team' THEN COALESCE(backfill_started_at, now()) ELSE backfill_started_at END
      WHERE id=${args.accountId} AND last_history_id IS NULL
    `);
    args.signal.throwIfAborted();
    return ok({ applied: 0 });
  }

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
      return page;
    }

    const ap = await applyHistoryPage({
      db,
      accountId: args.accountId,
      page: page.value,
      gmail: args.gmail,
      signal: args.signal,
    });
    if (!ap.ok) return ap;
    applied += ap.value;
    newHistoryId = page.value.historyId;
    pageToken = page.value.nextPageToken;
  } while (pageToken !== undefined);

  await db.execute(sql`
    UPDATE email_accounts
    SET last_history_id=${newHistoryId}, last_sync_at=now(), last_error_id=NULL
    WHERE id=${args.accountId}
  `);
  args.signal.throwIfAborted();
  return ok({ applied });
}
