// The paged Inbox list. Extracted from emailReads.ts (300-line cap split); re-exported there so
// callers keep a single import point.
import { type SQL, sql } from "drizzle-orm";
import { INBOX_PAGE_SIZE, INBOX_SCAN_CHUNK } from "@/constants/inbox";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { canSeeEmail } from "./emailVisibility";
import {
  type InboxFilter,
  type InboxThread,
  matchesInboxFilter,
  type ThreadRow,
  toInboxThread,
  toVisibilityRow,
} from "./threadShape";

// Position in the (last_message_at DESC NULLS LAST, id DESC) ordering. `id` breaks ties so the
// scan cannot skip or repeat a thread when several share a last_message_at.
export interface InboxCursor {
  lastMessageAt: string | null;
  id: string;
}

export interface InboxPage {
  threads: InboxThread[];
  // null once the mailbox is exhausted. Otherwise, feed it back to fetch the following page.
  nextCursor: InboxCursor | null;
}

// Rows strictly after `cursor` in (last_message_at DESC NULLS LAST, id DESC). Nulls sort last, so a
// non-null cursor is still followed by the whole null block, while a null cursor is already inside
// that block and only compares ids.
function afterCursor(cursor: InboxCursor | null): SQL {
  if (cursor === null) return sql`true`;
  if (cursor.lastMessageAt === null) {
    return sql`(t.last_message_at IS NULL AND t.id < ${cursor.id})`;
  }
  return sql`(
    t.last_message_at IS NULL
    OR t.last_message_at < ${cursor.lastMessageAt}
    OR (t.last_message_at = ${cursor.lastMessageAt} AND t.id < ${cursor.id})
  )`;
}

// Candidate set = threads the actor OWNS (mailbox owner) PLUS all shared threads. The shared ones
// are narrowed afterwards by canSeeEmail; owner threads are always visible.
async function scanCandidates(
  db: Db,
  actorId: string,
  cursor: InboxCursor | null,
  chunk: number,
): Promise<ThreadRow[]> {
  return (
    await db.execute(sql`
      SELECT t.id, t.subject, t.last_message_at, t.person_id, t.deal_id, t.visibility, t.account_id,
        t.follow_up_status, t.labels,
        -- Mailbox owner: lets canSeeEmail settle the owner case without a lookup per row.
        a.user_id AS owner_user_id,
        -- Correspondent (the OTHER party), Pipedrive-style. Address prefers the latest message from
        -- someone other than the mailbox owner (an inbound reply); then the latest message's first
        -- recipient (a thread the owner started, nobody has replied); then the latest sender as a
        -- last resort. Never leads with the owner's own address, which made an inbox of sent mail
        -- show "me" on every row. Name prefers the linked contact, then the counterparty's From name.
        COALESCE(co.from_email, lm.to_emails->>0, lm.from_email) AS sender_email,
        COALESCE(NULLIF(p.name, ''), co.from_name) AS sender_name,
        lm.snippet AS snippet,
        EXISTS (
          SELECT 1 FROM email_message_attachments att
            JOIN email_messages am ON am.id = att.message_id
          WHERE am.thread_id = t.id
        ) AS has_attachment,
        -- Unread = no read row yet, or last read predates last_message_at. The IS NOT NULL
        -- guard avoids NULL < NULL propagating to NULL (matches inboxUnreadCount, readState.ts).
        (r.read_at IS NULL OR (t.last_message_at IS NOT NULL AND r.read_at < t.last_message_at)) AS unread
      FROM email_threads t
        JOIN email_accounts a ON a.id = t.account_id
        LEFT JOIN persons p ON p.id = t.person_id
        LEFT JOIN email_thread_reads r ON r.thread_id = t.id AND r.user_id = ${actorId}
        LEFT JOIN LATERAL (
          SELECT m.from_email, m.to_emails, m.snippet
          FROM email_messages m
          WHERE m.thread_id = t.id
          ORDER BY m.sent_at DESC NULLS LAST, m.created_at DESC
          LIMIT 1
        ) lm ON true
        -- Latest message NOT from the mailbox owner: the counterparty's From, for the row label.
        LEFT JOIN LATERAL (
          SELECT m.from_email, m.from_name
          FROM email_messages m
          WHERE m.thread_id = t.id AND lower(m.from_email) <> lower(a.email_address)
          ORDER BY m.sent_at DESC NULLS LAST, m.created_at DESC
          LIMIT 1
        ) co ON true
      WHERE (a.user_id = ${actorId} OR t.visibility = 'shared')
        -- archived_at is a per-OWNER local flag: it hides a thread from the owner's Inbox only,
        -- never from a co-viewer of a shared thread (who has no owner Archive folder to recover it).
        AND (a.user_id <> ${actorId} OR t.archived_at IS NULL)
        -- trashed_at (P4) is a real Gmail-Trash move: the thread is gone for everyone, so exclude it
        -- unconditionally (unlike the per-owner archive flag).
        AND t.trashed_at IS NULL
        AND ${afterCursor(cursor)}
      ORDER BY t.last_message_at DESC NULLS LAST, t.id DESC
      LIMIT ${chunk}
    `)
  ).rows as unknown as ThreadRow[];
}

/**
 * One page of the actor's inbox, newest first.
 *
 * Visibility and the unmatched/needs_linking filter are decided AFTER the query, so a chunk of
 * candidate rows can yield fewer visible threads than it holds. The scan therefore keeps pulling
 * chunks until the page is full or the mailbox runs out; a plain `LIMIT n` would hand back short
 * pages and make "Load more" look like the end of the list.
 *
 * The returned cursor points at the last row SCANNED, not the last row shown, so the next page
 * resumes past the invisible rows this one skipped rather than re-examining them.
 */
export async function listInbox(
  db: Db,
  args: { actor: AuthUser; filter: InboxFilter; limit?: number; cursor?: InboxCursor | null },
  signal: AbortSignal,
): Promise<InboxPage> {
  signal.throwIfAborted();
  const limit = args.limit ?? INBOX_PAGE_SIZE;

  const threads: InboxThread[] = [];
  let cursor: InboxCursor | null = args.cursor ?? null;
  let exhausted = false;
  let consumedEveryScannedRow = true;

  while (threads.length < limit && !exhausted) {
    const rows = await scanCandidates(db, args.actor.id, cursor, INBOX_SCAN_CHUNK);
    signal.throwIfAborted();
    // A short chunk means the candidate set is finished; a full one may have more behind it.
    exhausted = rows.length < INBOX_SCAN_CHUNK;
    consumedEveryScannedRow = true;

    for (const row of rows) {
      // Advance the cursor for EVERY row examined, visible or not, so the next page does not
      // re-scan rows this one already rejected.
      cursor = { lastMessageAt: row.last_message_at, id: row.id };

      const visible = await canSeeEmail(db, args.actor, toVisibilityRow(row), signal);
      if (!visible || !matchesInboxFilter(row, args.filter)) continue;
      threads.push(toInboxThread(row, args.actor.id));

      if (threads.length === limit) {
        // Stopped mid-chunk: rows behind this one are unexamined, so this is not the end.
        consumedEveryScannedRow = rows.at(-1)?.id === row.id;
        break;
      }
    }
  }
  signal.throwIfAborted();

  const reachedEnd = exhausted && consumedEveryScannedRow;
  return { threads, nextCursor: reachedEnd ? null : cursor };
}
