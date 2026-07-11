import { type SQL, sql } from "drizzle-orm";
import { INBOX_PAGE_SIZE } from "@/constants/inbox";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { type InboxThread, toInboxThread } from "./emailReads";

interface ThreadRow {
  id: string;
  subject: string | null;
  last_message_at: string | null;
  person_id: string | null;
  deal_id: string | null;
  visibility: string;
  owner_user_id?: string;
  follow_up_status: string | null;
  labels: string[];
  // The column the folder orders by (archived_at, or the thread's latest outbound sent_at),
  // projected under a common name so one cursor shape serves both folders.
  cursor_at?: string;
}

// Position in a folder's (ordered_at DESC, id DESC) ordering. `id` breaks ties so a page boundary
// can neither skip nor repeat a thread when two share a timestamp.
export interface FolderCursor {
  at: string;
  id: string;
}

export interface FolderPage {
  threads: InboxThread[];
  nextCursor: FolderCursor | null;
}

export interface FolderPageArgs {
  limit?: number;
  cursor?: FolderCursor | null;
}

// Rows strictly after `cursor`. Both folders order by a NOT NULL timestamp, so there is no null
// block to straddle (archived_at IS NOT NULL is in the WHERE; sent_at IS NOT NULL guards the MAX).
function afterCursor(cursor: FolderCursor | null, column: SQL): SQL {
  if (cursor === null) return sql`true`;
  return sql`(${column} < ${cursor.at} OR (${column} = ${cursor.at} AND t.id < ${cursor.id}))`;
}

// Unlike the Inbox, these folders apply no post-query visibility filter (they are owner-scoped in
// SQL), so a page is exactly `limit` rows. Fetch one extra row purely to learn whether another page
// exists: without it a page that exactly fills the limit would advertise a next cursor and "Load
// more" would fetch nothing.
function toPage(rows: ThreadRow[], limit: number, actorId: string): FolderPage {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);
  const nextCursor =
    hasMore && last !== undefined && last.cursor_at !== undefined
      ? { at: last.cursor_at, id: last.id }
      : null;
  // Sent/Archive are owner-scoped in SQL, so the viewer owns every row here (isOwner true).
  return { threads: page.map((r) => toInboxThread(r, actorId)), nextCursor };
}

// Archived threads on the actor's OWN mailbox (D2). Archive is a per-owner local flag,
// so this is owner-scoped only (no shared-thread widening): a shared thread is unarchived
// from each viewer's Inbox independently is out of scope; archive belongs to the owner.
export async function listArchivedThreads(
  db: Db,
  actor: AuthUser,
  signal: AbortSignal,
  args: FolderPageArgs = {},
): Promise<FolderPage> {
  signal.throwIfAborted();
  const limit = args.limit ?? INBOX_PAGE_SIZE;
  const cursor = args.cursor ?? null;
  const rows = (
    await db.execute(sql`
      SELECT t.id, t.subject, t.last_message_at, t.person_id, t.deal_id, t.visibility,
             a.user_id AS owner_user_id, t.follow_up_status, t.labels, t.archived_at AS cursor_at
      FROM email_threads t JOIN email_accounts a ON a.id = t.account_id
      WHERE t.archived_at IS NOT NULL AND t.trashed_at IS NULL AND a.user_id = ${actor.id}
        AND ${afterCursor(cursor, sql`t.archived_at`)}
      ORDER BY t.archived_at DESC, t.id DESC
      LIMIT ${limit + 1}
    `)
  ).rows as unknown as ThreadRow[];
  signal.throwIfAborted();
  return toPage(rows, limit, actor.id);
}

// Threads on the actor's mailbox with at least one outbound, sent message. Ordered by the
// latest outbound sent_at DESC (Pipedrive's Sent is conversation-based, not per-message).
export async function listSentThreads(
  db: Db,
  actor: AuthUser,
  signal: AbortSignal,
  args: FolderPageArgs = {},
): Promise<FolderPage> {
  signal.throwIfAborted();
  const limit = args.limit ?? INBOX_PAGE_SIZE;
  const cursor = args.cursor ?? null;
  // The cursor compares against the aggregate, so it belongs in HAVING, not WHERE.
  const having =
    cursor === null
      ? sql`true`
      : sql`(MAX(m.sent_at) < ${cursor.at}
             OR (MAX(m.sent_at) = ${cursor.at} AND t.id < ${cursor.id}))`;
  const rows = (
    await db.execute(sql`
      SELECT t.id, t.subject, t.last_message_at, t.person_id, t.deal_id, t.visibility,
             a.user_id AS owner_user_id, t.follow_up_status, t.labels, MAX(m.sent_at) AS cursor_at
      FROM email_threads t
        JOIN email_accounts a ON a.id = t.account_id
        JOIN email_messages m ON m.thread_id = t.id
      WHERE a.user_id = ${actor.id} AND m.direction = 'outbound' AND m.sent_at IS NOT NULL
        AND t.trashed_at IS NULL
      GROUP BY t.id, t.subject, t.last_message_at, t.person_id, t.deal_id, t.visibility,
        a.user_id, t.follow_up_status, t.labels
      HAVING ${having}
      ORDER BY cursor_at DESC, t.id DESC
      LIMIT ${limit + 1}
    `)
  ).rows as unknown as ThreadRow[];
  signal.throwIfAborted();
  return toPage(rows, limit, actor.id);
}

export interface OutboxItem {
  id: string;
  subject: string | null;
  to: string[];
  status: string;
  scheduledAt: string | null;
  errorId: string | null;
  createdAt: string;
}

interface OutboxRow {
  id: string;
  subject: string | null;
  to_emails: unknown;
  status: string;
  scheduled_at: string | null;
  error_id: string | null;
  created_at: string;
}

// Unsent/scheduled send attempts on the actor's mailbox: still queued (pending/sending),
// parked for review (needs_review), or scheduled for the future. Sent/failed-final rows
// are excluded. subject/to come from the jsonb payload the send action stored.
export async function listOutbox(
  db: Db,
  actor: AuthUser,
  signal: AbortSignal,
): Promise<OutboxItem[]> {
  signal.throwIfAborted();
  const rows = (
    await db.execute(sql`
      SELECT s.id,
             s.payload ->> 'subject' AS subject,
             COALESCE(s.payload -> 'to', '[]'::jsonb) AS to_emails,
             s.status, s.scheduled_at, s.error_id, s.created_at
      FROM email_send_attempts s JOIN email_accounts a ON a.id = s.account_id
      WHERE a.user_id = ${actor.id}
        AND (
          s.status IN ('pending', 'sending', 'needs_review')
          OR (s.scheduled_at IS NOT NULL AND s.scheduled_at > now())
        )
        AND s.status <> 'sent'
      ORDER BY s.created_at DESC
    `)
  ).rows as unknown as OutboxRow[];
  signal.throwIfAborted();
  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    to: Array.isArray(r.to_emails) ? (r.to_emails as string[]) : [],
    status: r.status,
    scheduledAt: r.scheduled_at,
    errorId: r.error_id,
    createdAt: r.created_at,
  }));
}
