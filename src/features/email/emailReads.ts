import { sql } from "drizzle-orm";
import { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { err, ok, type Result } from "@/types/result";
import { type AttachmentMeta, attachmentsForMessages } from "./attachmentReads";
import { canSeeEmail } from "./emailVisibility";
import { plainTextToSafeHtml } from "./plainText";
import { sanitizeInboundHtml } from "./sanitizeHtml";
import type { InboxThread, ThreadRow } from "./threadShape";
import { toVisibilityRow } from "./threadShape";
import { type TrackingEvent, trackingForMessages } from "./trackingReads";

// Template and signature reads live in emailAuthoringReads.ts (200-line cap split); the paged
// Inbox list lives in inboxList.ts and the shared row shape in threadShape.ts (300-line cap split).
// All re-exported here so callers keep a single import point.
export type { TemplateDetail } from "./emailAuthoringReads";
export { getTemplate, listSignatures, listTemplates } from "./emailAuthoringReads";
export type { InboxCursor, InboxPage } from "./inboxList";
export { listInbox } from "./inboxList";
export type { InboxFilter, InboxThread } from "./threadShape";
export { toInboxThread } from "./threadShape";

export interface ThreadMessage {
  messageId: string;
  gmailMessageId: string;
  direction: string;
  fromEmail: string;
  // Parsed From display name for the reader message header (PD shows "Name <email>"), null for bare.
  fromName: string | null;
  toEmails: string[];
  ccEmails: string[];
  subject: string | null;
  bodyHtml: string;
  sentAt: string | null;
  attachments: AttachmentMeta[];
  // Persisted per-recipient open/click history (source of record), newest first. Empty
  // when the message has no tracking tokens or no hits yet. Distinct from the transient
  // WS trackingBadge in ThreadPane, which only nudges for the current session.
  tracking: TrackingEvent[];
}

export interface ThreadView {
  thread: InboxThread;
  messages: ThreadMessage[];
  // accountId: the thread's mailbox account. Comes from the server; NEVER fabricated
  // client-side. Required so the Composer can pass the correct send accountId.
  accountId: string;
  // canCompose: true only when the actor owns the mailbox (email_accounts.user_id === actor.id).
  // Computed server-side after the canSeeEmail check so privacy semantics are unchanged.
  canCompose: boolean;
  // The mailbox's own address (email_accounts.email_address). The reader uses this as the
  // "self" address so buildReplyPrefill can exclude it from reply-all recipients.
  ownerEmail: string;
  // Display labels for the linked person / deal, so the reader header shows the record's NAME
  // (Pipedrive parity) instead of the type noun "Person" / "Deal". Null when not linked.
  personName: string | null;
  dealTitle: string | null;
}

// jsonb columns (to_emails/cc_emails) round-trip through the driver as `unknown`;
// narrow defensively rather than trusting the DB shape.
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}

// Load a thread + its messages (newest-first), enforcing canSeeEmail. An invisible (or
// missing) thread returns E_GMAIL_011 -> NOT_FOUND (404-on-invisible, never leaks
// existence). Each body_html is sanitized with the caller's allowRemote choice.
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
  // Both joins are scoped to this thread's own message ids (rows fetched above are already
  // gated by the canSeeEmail check), so neither can surface data from a message the actor
  // cannot see.
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
    // Prefer the HTML part; fall back to a safe HTML rendering of the text/plain part (many
    // transactional / mailing-list emails carry only text/plain and would otherwise be blank).
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

  // Compute canCompose: actor owns the mailbox iff email_accounts.user_id === actor.id.
  // Minimal lookup after the canSeeEmail check so privacy semantics are unchanged. Also
  // carries the mailbox address (ownerEmail) the reader needs as the reply/forward "self".
  const acctRow = (
    await db.execute(
      sql`SELECT user_id, email_address FROM email_accounts WHERE id=${t.account_id}`,
    )
  ).rows[0] as { user_id: string; email_address: string } | undefined;
  signal.throwIfAborted();
  const canCompose = acctRow !== undefined && acctRow.user_id === args.actor.id;

  // Linked-record display labels: the reader header shows the person's NAME and the deal's TITLE,
  // not the type nouns "Person" / "Deal" (Pipedrive parity; the link-shows-type-noun smell).
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
      // The reader marks the thread read itself (mark-read-on-open in ThreadPane); this
      // projection isn't used to render unread state, so default false keeps the shape uniform.
      unread: false,
      followUpStatus: t.follow_up_status,
      labels: t.labels,
      // Owning the mailbox is exactly canCompose, computed above; reuse it so the reader can gate
      // the same owner-only privacy affordance the list row does.
      isOwner: canCompose,
      // The reader shows the full messages below, so the list-row sender/snippet aren't projected here.
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
