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

// SQL narrowing for the U5 quick-filters (A12). ADDITIVE to the owner-scoping WHERE, never a
// replacement: each fragment is AND-ed into the candidate scan. The linking tabs
// (all/unmatched/needs_linking) are still decided post-query in matchesInboxFilter, so they return
// the always-true fragment here. `a` (email_accounts) and `t` (email_threads) are in scope.
// Exported so searchInbox applies the SAME narrowing (search results feed the same ThreadList as the
// inbox, so the active quick-filter must narrow both), without duplicating the SQL (codex review).
export function quickFilterPredicate(filter: InboxFilter): SQL {
  switch (filter) {
    case "shared":
      return sql`t.visibility = 'shared'`;
    case "private":
      return sql`t.visibility = 'private'`;
    // Tracked = the thread has at least one minted tracking token. A token reaches its thread via
    // the delivered MESSAGE (backfillTokens sets token.message_id after send), NOT via the send
    // attempt: a newly-composed send enqueues with attempt.thread_id=NULL (no local thread yet) and
    // never backfills it, so joining on the attempt would miss the normal new-send case (codex P1).
    case "tracked":
      return sql`EXISTS (
        SELECT 1 FROM email_tracking_tokens tk
          JOIN email_messages tm ON tm.id = tk.message_id
        WHERE tm.thread_id = t.id
      )`;
    // To: me = the mailbox owner's address is a direct recipient of some message. to_emails is a
    // jsonb array of address strings; ::citext makes the comparison case-insensitive.
    case "to_me":
      return sql`EXISTS (
        SELECT 1 FROM email_messages m
        WHERE m.thread_id = t.id
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(m.to_emails) AS rcpt(addr)
            WHERE rcpt.addr::citext = a.email_address
          )
      )`;
    // From an existing contact = some non-owner sender address matches a persons row (primary_email
    // or one of the jsonb emails[].value). citext columns compare case-insensitively.
    case "from_contact":
      return sql`EXISTS (
        SELECT 1 FROM email_messages m
          JOIN persons pc ON pc.deleted_at IS NULL AND (
            pc.primary_email = m.from_email
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(pc.emails) AS pe
              WHERE (pe->>'value')::citext = m.from_email
            )
          )
        WHERE m.thread_id = t.id
          AND m.from_email <> a.email_address
      )`;
    // Linked with an open deal = the linked deal is neither won nor lost (status = 'open') and not
    // soft-deleted.
    case "linked_open_deal":
      return sql`EXISTS (
        SELECT 1 FROM deals d
        WHERE d.id = t.deal_id AND d.status = 'open' AND d.deleted_at IS NULL
      )`;
    // Linking tabs are decided post-query in matchesInboxFilter; no SQL narrowing here.
    case "all":
    case "unmatched":
    case "needs_linking":
      return sql`true`;
  }
}

// Candidate set = threads in the actor's OWN mailbox only. The Inbox folder is personal (like Sent
// and Archive, which are already owner-scoped): a colleague's shared thread is NOT injected into
// another user's Inbox. Shared threads still reach co-workers on the linked deal/contact record via
// listThreadsForDeal / listThreadsForContact (router forDeal/forContact). canSeeEmail still runs per
// row below, but for an owned mailbox it is always satisfied by the owner branch.
async function scanCandidates(
  db: Db,
  actorId: string,
  filter: InboxFilter,
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
      WHERE a.user_id = ${actorId}
        -- archived_at hides a thread from its owner's Inbox (the Archive folder shows it instead).
        AND t.archived_at IS NULL
        -- trashed_at (P4) is a real Gmail-Trash move: exclude it unconditionally.
        AND t.trashed_at IS NULL
        -- U5 quick-filter narrowing (true for the linking tabs), ADDITIVE to the owner scope above.
        AND ${quickFilterPredicate(filter)}
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
    const rows = await scanCandidates(db, args.actor.id, args.filter, cursor, INBOX_SCAN_CHUNK);
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
