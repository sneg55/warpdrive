import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { type InboxFilter, type InboxThread, toInboxThread } from "./emailReads";
import { quickFilterPredicate } from "./inboxList";
import { mailboxScopePredicate } from "./mailboxAccess";
import { replyStatusProjection } from "./replyStatus";
import { unreadPredicate } from "./unreadPredicate";

interface SearchThreadRow {
  id: string;
  subject: string | null;
  last_message_at: string | null;
  person_id: string | null;
  deal_id: string | null;
  visibility: string;
  account_id: string;
  owner_user_id: string;
  follow_up_status: string | null;
  labels: string[];
  has_attachment: boolean;
  unread: boolean;
}

export async function searchInbox(
  db: Db,
  args: { actor: AuthUser; q: string; filter?: InboxFilter; mailbox?: string },
  signal: AbortSignal,
): Promise<InboxThread[]> {
  signal.throwIfAborted();
  const like = `%${args.q.trim()}%`;
  const filter: InboxFilter = args.filter ?? "all";
  const rows = (
    await db.execute(sql`
      SELECT ${replyStatusProjection}, t.id, t.subject, t.last_message_at, t.person_id, t.deal_id, t.visibility,
        t.account_id, ${args.actor.id}::uuid AS owner_user_id, t.follow_up_status, t.labels,
        EXISTS (
          SELECT 1 FROM email_message_attachments att
            JOIN email_messages am ON am.id = att.message_id
          WHERE am.thread_id = t.id
        ) AS has_attachment,
        (${unreadPredicate}) AS unread
      FROM email_threads t
      JOIN email_accounts a ON a.id = t.account_id
      LEFT JOIN email_thread_reads r ON a.kind='personal' AND r.thread_id = t.id AND r.user_id = ${args.actor.id}
      WHERE t.trashed_at IS NULL
        AND ${mailboxScopePredicate(args.actor.id, args.mailbox)}
        AND ${quickFilterPredicate(filter)}
        AND (
          t.subject ILIKE ${like}
          OR EXISTS (
            SELECT 1 FROM email_messages m
            WHERE m.thread_id = t.id
              AND (
                m.body_text ILIKE ${like}
                OR m.snippet ILIKE ${like}
                OR m.from_email ILIKE ${like}
                OR m.from_name ILIKE ${like}
              )
          )
        )
      ORDER BY t.last_message_at DESC NULLS LAST
      LIMIT 100
    `)
  ).rows as unknown as SearchThreadRow[];
  signal.throwIfAborted();

  return rows.map((t) => toInboxThread(t, args.actor.id));
}
