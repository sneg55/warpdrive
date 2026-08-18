import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { canSeeEmail } from "./emailVisibility";

// One linked email as the record timelines render it: everything a collapsed card shows and
// nothing more. Bodies are deliberately absent, they load per message on expand (spec D4).
export interface EmailTimelineMessage {
  messageId: string;
  threadId: string;
  subject: string | null;
  sentAt: string | null;
  // Fallback ordering key when Gmail supplied no Date header, so such a message still lands
  // in a deterministic position instead of at the epoch.
  createdAt: string;
  direction: string;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  snippet: string | null;
  hasAttachment: boolean;
  // Actor owns this message's mailbox. Per message, not per feed: a record can carry threads
  // from more than one mailbox, so the compose affordances are decided row by row.
  canCompose: boolean;
}

interface MessageRow {
  message_id: string;
  thread_id: string;
  subject: string | null;
  sent_at: string | null;
  created_at: string;
  direction: string;
  from_email: string;
  from_name: string | null;
  to_emails: unknown;
  snippet: string | null;
  has_attachment: boolean;
  owner_user_id: string;
  account_id: string;
  visibility: string;
  deal_id: string | null;
  person_id: string | null;
}

// jsonb columns round-trip through the driver as `unknown`; narrow rather than trust the shape.
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}

// Messages on threads linked to an entity column, newest first, filtered to what the actor may
// see. Deal and contact differ only by that column, which is a fixed identifier and never user
// input, so interpolating it is safe; the linked value is bound.
//
// archived_at is deliberately NOT filtered: it is a per-owner Inbox preference, so a colleague
// archiving a thread out of their own mailbox must not erase it from the record's history.
// trashed_at IS filtered: it means Gmail dropped the conversation from the live mailbox.
async function listMessagesBy(
  db: Db,
  column: "deal_id" | "person_id",
  value: string,
  actor: AuthUser,
  signal: AbortSignal,
): Promise<EmailTimelineMessage[]> {
  signal.throwIfAborted();
  const rows = (
    await db.execute(sql`
      SELECT m.id AS message_id, m.thread_id, m.subject, m.sent_at, m.created_at, m.direction,
        m.from_email, m.from_name, m.to_emails, m.snippet,
        EXISTS (
          SELECT 1 FROM email_message_attachments att WHERE att.message_id = m.id
        ) AS has_attachment,
        a.user_id AS owner_user_id,
        t.account_id, t.visibility, t.deal_id, t.person_id
      FROM email_messages m
        JOIN email_threads t ON t.id = m.thread_id
        JOIN email_accounts a ON a.id = t.account_id
      WHERE t.${sql.raw(column)} = ${value} AND t.trashed_at IS NULL
      ORDER BY m.sent_at DESC NULLS LAST, m.created_at DESC
    `)
  ).rows as unknown as MessageRow[];
  signal.throwIfAborted();

  // Visibility is a per-thread property, so resolve it once per distinct thread rather than once
  // per message: a long thread would otherwise re-run the same check for every message it holds.
  const byThread = new Map<string, MessageRow>();
  for (const r of rows) if (!byThread.has(r.thread_id)) byThread.set(r.thread_id, r);
  const threadIds = [...byThread.keys()];
  const visible = await Promise.all(
    threadIds.map((id) => {
      const r = byThread.get(id);
      if (r === undefined) return Promise.resolve(false);
      return canSeeEmail(
        db,
        actor,
        {
          accountId: r.account_id,
          visibility: r.visibility,
          dealId: r.deal_id,
          personId: r.person_id,
          ownerUserId: r.owner_user_id,
        },
        signal,
      );
    }),
  );
  signal.throwIfAborted();
  const allowed = new Set(threadIds.filter((_, i) => visible[i] === true));

  return rows
    .filter((r) => allowed.has(r.thread_id))
    .map((r) => ({
      messageId: r.message_id,
      threadId: r.thread_id,
      subject: r.subject,
      sentAt: r.sent_at,
      createdAt: r.created_at,
      direction: r.direction,
      fromEmail: r.from_email,
      fromName: r.from_name,
      toEmails: asStringArray(r.to_emails),
      snippet: r.snippet,
      hasAttachment: r.has_attachment,
      canCompose: r.owner_user_id === actor.id,
    }));
}

// Messages on threads linked to a deal. Feeds the deal workspace timeline.
export function listMessagesForDeal(
  db: Db,
  args: { actor: AuthUser; dealId: string },
  signal: AbortSignal,
): Promise<EmailTimelineMessage[]> {
  return listMessagesBy(db, "deal_id", args.dealId, args.actor, signal);
}

// Messages on threads linked to a person. Feeds the person detail timeline.
export function listMessagesForContact(
  db: Db,
  args: { actor: AuthUser; personId: string },
  signal: AbortSignal,
): Promise<EmailTimelineMessage[]> {
  return listMessagesBy(db, "person_id", args.personId, args.actor, signal);
}
