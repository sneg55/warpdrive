import { sql } from "drizzle-orm";
import { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { err, ok, type Result } from "@/types/result";
import { type AttachmentMeta, attachmentsForMessages } from "./attachmentReads";
import { canSeeEmail } from "./emailVisibility";
import { canUseMailbox } from "./mailboxAccess";
import { plainTextToSafeHtml } from "./plainText";
import { sanitizeInboundHtml } from "./sanitizeHtml";
import type { InboxThread, ThreadRow } from "./threadShape";
import { toVisibilityRow } from "./threadShape";
import { type TrackingEvent, trackingForMessages } from "./trackingReads";

export { getTemplate, listSignatures, listTemplates } from "./emailAuthoringReads";
export { listInbox } from "./inboxList";
export type { InboxFilter, InboxThread } from "./threadShape";
export { toInboxThread } from "./threadShape";

export interface ThreadMessage {
  messageId: string;
  gmailMessageId: string;
  direction: string;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  ccEmails: string[];
  subject: string | null;
  bodyHtml: string;
  sentAt: string | null;
  attachments: AttachmentMeta[];
  tracking: TrackingEvent[];
}

export interface ThreadView {
  thread: InboxThread;
  messages: ThreadMessage[];
  accountId: string;
  canCompose: boolean;
  ownerEmail: string;
  personName: string | null;
  dealTitle: string | null;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}

export async function getThread(
  db: Db,
  args: { actor: AuthUser; threadId: string; allowRemote: boolean },
  signal: AbortSignal,
): Promise<Result<ThreadView, AppError>> {
  signal.throwIfAborted();
  const t = (
    await db.execute(sql`
      SELECT id, subject, last_message_at, person_id, deal_id, visibility, account_id,
        follow_up_status, labels
      FROM email_threads WHERE id=${args.threadId} AND trashed_at IS NULL
    `)
  ).rows[0] as unknown as ThreadRow | undefined;
  signal.throwIfAborted();
  if (t === undefined || !(await canSeeEmail(db, args.actor, toVisibilityRow(t), signal))) {
    return err(new AppError("E_GMAIL_011", "thread not found", {}));
  }

  const rows = (
    await db.execute(sql`
      SELECT id, gmail_message_id, direction, from_email, from_name, to_emails, cc_emails, subject, body_html, body_text, sent_at
      FROM email_messages WHERE thread_id=${args.threadId}
      ORDER BY sent_at DESC NULLS LAST, created_at DESC
    `)
  ).rows as {
    id: string;
    gmail_message_id: string;
    direction: string;
    from_email: string;
    from_name: string | null;
    to_emails: unknown;
    cc_emails: unknown;
    subject: string | null;
    body_html: string | null;
    body_text: string | null;
    sent_at: string | null;
  }[];
  signal.throwIfAborted();

  const messageIds = rows.map((m) => m.id);
  const attachmentsByMessage = await attachmentsForMessages(db, messageIds, signal);
  signal.throwIfAborted();
  const trackingByMessage = await trackingForMessages(db, messageIds, signal);
  signal.throwIfAborted();

  const messages: ThreadMessage[] = rows.map((m) => ({
    messageId: m.id,
    gmailMessageId: m.gmail_message_id,
    direction: m.direction,
    fromEmail: m.from_email,
    fromName: m.from_name,
    toEmails: asStringArray(m.to_emails),
    ccEmails: asStringArray(m.cc_emails),
    subject: m.subject,
    bodyHtml: sanitizeInboundHtml(
      m.body_html !== null && m.body_html.trim() !== ""
        ? m.body_html
        : plainTextToSafeHtml(m.body_text ?? ""),
      { allowRemote: args.allowRemote },
    ),
    sentAt: m.sent_at,
    attachments: attachmentsByMessage.get(m.id) ?? [],
    tracking: trackingByMessage.get(m.id) ?? [],
  }));

  const acctRow = (
    await db.execute(
      sql`SELECT user_id, email_address FROM email_accounts WHERE id=${t.account_id}`,
    )
  ).rows[0] as { user_id: string; email_address: string } | undefined;
  signal.throwIfAborted();
  const canCompose = await canUseMailbox(db, t.account_id, args.actor.id, signal);

  let personName: string | null = null;
  if (t.person_id !== null) {
    const pr = (await db.execute(sql`SELECT name FROM persons WHERE id=${t.person_id}`)).rows[0] as
      | { name: string | null }
      | undefined;
    personName = pr?.name ?? null;
  }
  signal.throwIfAborted();
  let dealTitle: string | null = null;
  if (t.deal_id !== null) {
    const dr = (await db.execute(sql`SELECT title FROM deals WHERE id=${t.deal_id}`)).rows[0] as
      | { title: string | null }
      | undefined;
    dealTitle = dr?.title ?? null;
  }
  signal.throwIfAborted();

  return ok({
    thread: {
      id: t.id,
      subject: t.subject,
      lastMessageAt: t.last_message_at,
      personId: t.person_id,
      dealId: t.deal_id,
      visibility: t.visibility,
      unread: false,
      followUpStatus: t.follow_up_status,
      labels: t.labels,
      isOwner: canCompose,
      senderEmail: null,
      senderName: null,
      snippet: null,
      hasAttachment: false,
    },
    messages,
    accountId: t.account_id,
    canCompose,
    ownerEmail: acctRow?.email_address ?? "",
    personName,
    dealTitle,
  });
}
