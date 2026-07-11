import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { type InboxThread, toInboxThread } from "./emailReads";
import { canSeeEmail } from "./emailVisibility";

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

// In-mail search over the actor's visible threads: matches subject, any message's
// body_text/snippet, or a message's from_email/from_name (case-insensitive substring).
// from_name is searched too: the sender's display name lives there (from_email is the bare
// address), so a name query must match it. Candidate
// set mirrors listInbox (owned OR shared visibility) so the query stays index-friendly;
// each candidate is then re-checked with canSeeEmail so a shared thread linked to a
// deal/person the actor can no longer see never leaks into results.
export async function searchInbox(
  db: Db,
  args: { actor: AuthUser; q: string },
  signal: AbortSignal,
): Promise<InboxThread[]> {
  signal.throwIfAborted();
  const like = `%${args.q.trim()}%`;
  const rows = (
    await db.execute(sql`
      SELECT t.id, t.subject, t.last_message_at, t.person_id, t.deal_id, t.visibility,
        t.account_id, a.user_id AS owner_user_id, t.follow_up_status, t.labels,
        -- Same projection as listInbox, so the client Has-attachment / Unread-only quick-filters
        -- narrow search results the same way they narrow the inbox (codex review).
        EXISTS (
          SELECT 1 FROM email_message_attachments att
            JOIN email_messages am ON am.id = att.message_id
          WHERE am.thread_id = t.id
        ) AS has_attachment,
        (r.read_at IS NULL OR (t.last_message_at IS NOT NULL AND r.read_at < t.last_message_at)) AS unread
      FROM email_threads t
      JOIN email_accounts a ON a.id = t.account_id
      LEFT JOIN email_thread_reads r ON r.thread_id = t.id AND r.user_id = ${args.actor.id}
      WHERE t.trashed_at IS NULL
        AND (a.user_id = ${args.actor.id} OR t.visibility = 'shared')
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

  const out: InboxThread[] = [];
  for (const t of rows) {
    const visible = await canSeeEmail(
      db,
      args.actor,
      {
        accountId: t.account_id,
        visibility: t.visibility,
        dealId: t.deal_id,
        personId: t.person_id,
      },
      signal,
    );
    if (!visible) continue;
    out.push(toInboxThread(t, args.actor.id));
  }
  return out;
}
