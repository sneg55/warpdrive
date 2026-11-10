import { type SQL, sql } from "drizzle-orm";
import { INBOX_PAGE_SIZE, INBOX_SCAN_CHUNK } from "@/constants/inbox";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { mailboxScopePredicate } from "./mailboxAccess";
import { replyStatusProjection } from "./replyStatus";
import {
  type InboxFilter,
  type InboxThread,
  matchesInboxFilter,
  type ThreadRow,
  toInboxThread,
} from "./threadShape";
import { unreadPredicate } from "./unreadPredicate";

export interface InboxCursor {
  lastMessageAt: string | null;
  id: string;
}

export interface InboxPage {
  threads: InboxThread[];
  nextCursor: InboxCursor | null;
}

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

export function quickFilterPredicate(filter: InboxFilter): SQL {
  switch (filter) {
    case "shared":
      return sql`t.visibility = 'shared'`;
    case "private":
      return sql`t.visibility = 'private'`;
    case "tracked":
      return sql`EXISTS (
        SELECT 1 FROM email_tracking_tokens tk
          JOIN email_messages tm ON tm.id = tk.message_id
        WHERE tm.thread_id = t.id
      )`;
    case "to_me":
      return sql`EXISTS (
        SELECT 1 FROM email_messages m
        WHERE m.thread_id = t.id
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(m.to_emails) AS rcpt(addr)
            WHERE rcpt.addr::citext = a.email_address
          )
      )`;
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
    case "linked_open_deal":
      return sql`EXISTS (
        SELECT 1 FROM deals d
        WHERE d.id = t.deal_id AND d.status = 'open' AND d.deleted_at IS NULL
      )`;
    case "all":
    case "unmatched":
    case "needs_linking":
      return sql`true`;
  }
}

async function scanCandidates(
  db: Db,
  actorId: string,
  filter: InboxFilter,
  cursor: InboxCursor | null,
  chunk: number,
  signal: AbortSignal,
  mailbox?: string,
): Promise<ThreadRow[]> {
  const rows = (
    await db.execute(sql`
      SELECT ${replyStatusProjection}, t.id, t.subject, t.last_message_at, t.person_id, t.deal_id, t.visibility, t.account_id,
        t.follow_up_status, t.labels,
        ${actorId}::uuid AS owner_user_id,
        COALESCE(co.from_email, lm.to_emails->>0, lm.from_email) AS sender_email,
        COALESCE(NULLIF(p.name, ''), co.from_name) AS sender_name,
        lm.snippet AS snippet,
        EXISTS (
          SELECT 1 FROM email_message_attachments att
            JOIN email_messages am ON am.id = att.message_id
          WHERE am.thread_id = t.id
        ) AS has_attachment,
        (${unreadPredicate}) AS unread
      FROM email_threads t
        JOIN email_accounts a ON a.id = t.account_id
        LEFT JOIN persons p ON p.id = t.person_id
        LEFT JOIN email_thread_reads r ON a.kind='personal' AND r.thread_id = t.id AND r.user_id = ${actorId}
        LEFT JOIN LATERAL (
          SELECT m.from_email, m.to_emails, m.snippet
          FROM email_messages m
          WHERE m.thread_id = t.id
          ORDER BY m.sent_at DESC NULLS LAST, m.created_at DESC
          LIMIT 1
        ) lm ON true
        LEFT JOIN LATERAL (
          SELECT m.from_email, m.from_name
          FROM email_messages m
          WHERE m.thread_id = t.id AND lower(m.from_email) <> lower(a.email_address)
          ORDER BY m.sent_at DESC NULLS LAST, m.created_at DESC
          LIMIT 1
        ) co ON true
      WHERE ${mailboxScopePredicate(actorId, mailbox)}
        AND t.archived_at IS NULL
        AND t.trashed_at IS NULL
        AND ${quickFilterPredicate(filter)}
        AND ${afterCursor(cursor)}
      ORDER BY t.last_message_at DESC NULLS LAST, t.id DESC
      LIMIT ${chunk}
    `)
  ).rows as unknown as ThreadRow[];
  signal.throwIfAborted();
  return rows;
}

export async function listInbox(
  db: Db,
  args: {
    actor: AuthUser;
    filter: InboxFilter;
    limit?: number;
    cursor?: InboxCursor | null;
    mailbox?: string;
  },
  signal: AbortSignal,
): Promise<InboxPage> {
  signal.throwIfAborted();
  const limit = args.limit ?? INBOX_PAGE_SIZE;

  const threads: InboxThread[] = [];
  let cursor: InboxCursor | null = args.cursor ?? null;
  let exhausted = false;
  let consumedEveryScannedRow = true;

  while (threads.length < limit && !exhausted) {
    const rows = await scanCandidates(
      db,
      args.actor.id,
      args.filter,
      cursor,
      INBOX_SCAN_CHUNK,
      signal,
      args.mailbox,
    );
    signal.throwIfAborted();
    exhausted = rows.length < INBOX_SCAN_CHUNK;
    consumedEveryScannedRow = true;

    for (const row of rows) {
      cursor = { lastMessageAt: row.last_message_at, id: row.id };

      if (!matchesInboxFilter(row, args.filter)) continue;
      threads.push(toInboxThread(row, args.actor.id));

      if (threads.length === limit) {
        consumedEveryScannedRow = rows.at(-1)?.id === row.id;
        break;
      }
    }
  }
  signal.throwIfAborted();

  const reachedEnd = exhausted && consumedEveryScannedRow;
  return { threads, nextCursor: reachedEnd ? null : cursor };
}
