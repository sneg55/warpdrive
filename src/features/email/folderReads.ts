import { type SQL, sql } from "drizzle-orm";
import { INBOX_PAGE_SIZE } from "@/constants/inbox";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { type InboxThread, toInboxThread } from "./emailReads";
import { mailboxScopePredicate } from "./mailboxAccess";
import { replyStatusProjection } from "./replyStatus";

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
  sender_email?: string | null;
  sender_name?: string | null;
  cursor_at?: string;
}

const CORRESPONDENT_SELECT = sql`
  COALESCE(co.from_email, lm.to_emails->>0, lm.from_email) AS sender_email,
  COALESCE(NULLIF(p.name, ''), co.from_name) AS sender_name`;

const CORRESPONDENT_SELECT_AGG = sql`
  COALESCE(MAX(co.from_email), MAX(lm.to_emails->>0), MAX(lm.from_email)) AS sender_email,
  COALESCE(NULLIF(MAX(p.name), ''), MAX(co.from_name)) AS sender_name`;

const CORRESPONDENT_JOINS = sql`
  LEFT JOIN persons p ON p.id = t.person_id
  LEFT JOIN LATERAL (
    SELECT lmsg.from_email, lmsg.to_emails
    FROM email_messages lmsg
    WHERE lmsg.thread_id = t.id
    ORDER BY lmsg.sent_at DESC NULLS LAST, lmsg.created_at DESC
    LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT cmsg.from_email, cmsg.from_name
    FROM email_messages cmsg
    WHERE cmsg.thread_id = t.id AND lower(cmsg.from_email) <> lower(a.email_address)
    ORDER BY cmsg.sent_at DESC NULLS LAST, cmsg.created_at DESC
    LIMIT 1
  ) co ON true`;

interface FolderCursor {
  at: string;
  id: string;
}

export interface FolderPage {
  threads: InboxThread[];
  nextCursor: FolderCursor | null;
}

export interface FolderPageArgs {
  mailbox?: string;
  limit?: number;
  cursor?: FolderCursor | null;
}

function afterCursor(cursor: FolderCursor | null, column: SQL): SQL {
  if (cursor === null) return sql`true`;
  return sql`(${column} < ${cursor.at} OR (${column} = ${cursor.at} AND t.id < ${cursor.id}))`;
}

function toPage(rows: ThreadRow[], limit: number, actorId: string): FolderPage {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);
  const nextCursor =
    hasMore && last !== undefined && last.cursor_at !== undefined
      ? { at: last.cursor_at, id: last.id }
      : null;
  return { threads: page.map((r) => toInboxThread(r, actorId)), nextCursor };
}

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
      SELECT ${replyStatusProjection}, t.id, t.subject, t.last_message_at, t.person_id, t.deal_id, t.visibility,
             ${actor.id}::uuid AS owner_user_id, t.follow_up_status, t.labels, t.archived_at AS cursor_at,
             ${CORRESPONDENT_SELECT}
      FROM email_threads t JOIN email_accounts a ON a.id = t.account_id
        ${CORRESPONDENT_JOINS}
      WHERE t.archived_at IS NOT NULL AND t.trashed_at IS NULL AND ${mailboxScopePredicate(actor.id, args.mailbox)}
        AND ${afterCursor(cursor, sql`t.archived_at`)}
      ORDER BY t.archived_at DESC, t.id DESC
      LIMIT ${limit + 1}
    `)
  ).rows as unknown as ThreadRow[];
  signal.throwIfAborted();
  return toPage(rows, limit, actor.id);
}

export async function listSentThreads(
  db: Db,
  actor: AuthUser,
  signal: AbortSignal,
  args: FolderPageArgs = {},
): Promise<FolderPage> {
  signal.throwIfAborted();
  const limit = args.limit ?? INBOX_PAGE_SIZE;
  const cursor = args.cursor ?? null;
  const having =
    cursor === null
      ? sql`true`
      : sql`(MAX(m.sent_at) < ${cursor.at}
             OR (MAX(m.sent_at) = ${cursor.at} AND t.id < ${cursor.id}))`;
  const rows = (
    await db.execute(sql`
      SELECT ${replyStatusProjection}, t.id, t.subject, t.last_message_at, t.person_id, t.deal_id, t.visibility,
             ${actor.id}::uuid AS owner_user_id, t.follow_up_status, t.labels, MAX(m.sent_at) AS cursor_at,
             ${CORRESPONDENT_SELECT_AGG}
      FROM email_threads t
        JOIN email_accounts a ON a.id = t.account_id
        JOIN email_messages m ON m.thread_id = t.id
        ${CORRESPONDENT_JOINS}
      WHERE ${mailboxScopePredicate(actor.id, args.mailbox)} AND m.direction = 'outbound' AND m.sent_at IS NOT NULL
        AND t.trashed_at IS NULL
      GROUP BY t.id, t.subject, t.last_message_at, t.person_id, t.deal_id, t.visibility,
        a.user_id, a.kind, a.overdue_after_hours, t.follow_up_status, t.labels
      HAVING ${having}
      ORDER BY cursor_at DESC, t.id DESC
      LIMIT ${limit + 1}
    `)
  ).rows as unknown as ThreadRow[];
  signal.throwIfAborted();
  return toPage(rows, limit, actor.id);
}

export { listOutbox, type OutboxItem } from "./outboxReads";
