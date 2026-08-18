import { sql } from "drizzle-orm";
import { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { err, ok, type Result } from "@/types/result";
import { attachmentsForMessages } from "./attachmentReads";
import type { ThreadMessage } from "./emailReads";
import { canSeeEmail } from "./emailVisibility";
import { plainTextToSafeHtml } from "./plainText";
import { sanitizeInboundHtml } from "./sanitizeHtml";
import { trackingForMessages } from "./trackingReads";

interface Row {
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
  account_id: string;
  visibility: string;
  deal_id: string | null;
  person_id: string | null;
  owner_user_id: string;
  owner_email: string;
}

// ThreadMessage plus the two fields a reply needs, which the thread reader gets from ThreadView
// but a single-message read has to carry itself.
export interface TimelineMessageBody extends ThreadMessage {
  accountId: string;
  ownerEmail: string;
}

// jsonb columns round-trip through the driver as `unknown`; narrow rather than trust the shape.
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}

// One message with its body sanitized for the caller's allowRemote choice, enforcing canSeeEmail
// on the parent thread. Feeds expand-on-demand in the record timelines, where the collapsed cards
// carry no body. A missing or invisible message returns the same E_GMAIL_026, so the error never
// distinguishes the two (404-on-invisible, mirroring getThread's E_GMAIL_011).
export async function getMessage(
  db: Db,
  args: { actor: AuthUser; messageId: string; allowRemote: boolean },
  signal: AbortSignal,
): Promise<Result<TimelineMessageBody, AppError>> {
  signal.throwIfAborted();
  const row = (
    await db.execute(sql`
      SELECT m.id, m.gmail_message_id, m.direction, m.from_email, m.from_name, m.to_emails,
        m.cc_emails, m.subject, m.body_html, m.body_text, m.sent_at,
        t.account_id, t.visibility, t.deal_id, t.person_id,
        a.user_id AS owner_user_id, a.email_address AS owner_email
      FROM email_messages m
        JOIN email_threads t ON t.id = m.thread_id
        JOIN email_accounts a ON a.id = t.account_id
      WHERE m.id = ${args.messageId} AND t.trashed_at IS NULL
    `)
  ).rows[0] as unknown as Row | undefined;
  signal.throwIfAborted();

  if (
    row === undefined ||
    !(await canSeeEmail(
      db,
      args.actor,
      {
        accountId: row.account_id,
        visibility: row.visibility,
        dealId: row.deal_id,
        personId: row.person_id,
        ownerUserId: row.owner_user_id,
      },
      signal,
    ))
  ) {
    return err(new AppError("E_GMAIL_026", "message not found", {}));
  }
  signal.throwIfAborted();

  const attachments = await attachmentsForMessages(db, [row.id], signal);
  signal.throwIfAborted();
  const tracking = await trackingForMessages(db, [row.id], signal);
  signal.throwIfAborted();

  return ok({
    messageId: row.id,
    gmailMessageId: row.gmail_message_id,
    direction: row.direction,
    fromEmail: row.from_email,
    fromName: row.from_name,
    toEmails: asStringArray(row.to_emails),
    ccEmails: asStringArray(row.cc_emails),
    subject: row.subject,
    // Prefer the HTML part; fall back to safe HTML from text/plain, matching getThread so a
    // text-only message renders the same whichever read loaded it.
    bodyHtml: sanitizeInboundHtml(
      row.body_html !== null && row.body_html.trim() !== ""
        ? row.body_html
        : plainTextToSafeHtml(row.body_text ?? ""),
      { allowRemote: args.allowRemote },
    ),
    sentAt: row.sent_at,
    attachments: attachments.get(row.id) ?? [],
    tracking: tracking.get(row.id) ?? [],
    accountId: row.account_id,
    ownerEmail: row.owner_email,
  });
}
