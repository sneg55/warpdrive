import { sql } from "drizzle-orm";
import { GMAIL_DRAFT_LABEL } from "@/constants/email";
import type { AppError } from "@/constants/errorIds";
import { wsChannel } from "@/constants/wsChannels";
import type { Db } from "@/db/client";
import { notifyDealEmailReceived } from "@/features/notifications/wire";
import type { AuthUser } from "@/features/permissions/types";
import { publishEvent } from "@/server/notify";

import { ok, type Result } from "@/types/result";
import { upsertAppliedThread } from "./applyThread";
import type { GmailClient } from "./gmailClient";
import { mailboxVisibility } from "./mailboxVisibility";
import { messageGoneFromMailbox } from "./messageGone";
import { parseGmailMessage } from "./mimeParse";

export async function applyMessageIds(
  args: {
    db: Db;
    accountId: string;
    owner?: AuthUser;
    importedAt?: Date;
    gmail: GmailClient;
    signal: AbortSignal;
    touchedThreadIds?: Set<string>;
  },
  ids: string[],
): Promise<Result<number, AppError>> {
  args.signal.throwIfAborted();
  let applied = 0;

  const account = await args.db.execute(
    sql`SELECT email_address, kind FROM email_accounts WHERE id=${args.accountId}`,
  );
  args.signal.throwIfAborted();
  const mailbox = account.rows[0] as { email_address: string; kind: string } | undefined;
  if (mailbox === undefined) return ok(0);
  const visible = await mailboxVisibility(args.db, args.accountId, args.signal);
  const recipientRows =
    await args.db.execute(sql`SELECT user_id FROM email_accounts WHERE id=${args.accountId} AND user_id IS NOT NULL
    UNION SELECT user_id FROM email_account_members WHERE account_id=${args.accountId}`);
  args.signal.throwIfAborted();
  const recipients = recipientRows.rows as { user_id: string }[];
  const ownAddress = mailbox.email_address;

  const arrivals: DealEmailArrival[] = [];

  for (const id of ids) {
    const fetched = await args.gmail.getMessage({ id, signal: args.signal });
    args.signal.throwIfAborted();
    if (!fetched.ok) {
      if (messageGoneFromMailbox(fetched.error)) continue;
      return fetched;
    }
    if (fetched.value.labelIds.includes(GMAIL_DRAFT_LABEL)) continue;
    const parsed = parseGmailMessage(fetched.value);
    args.touchedThreadIds?.add(parsed.threadId);

    const inserted = await args.db.transaction(async (tx) => {
      const thread = await upsertAppliedThread(
        tx,
        { accountId: args.accountId, visible, importedAt: args.importedAt, signal: args.signal },
        parsed,
      );
      const direction =
        mailbox.kind === "team" && isSelfSent(parsed.fromEmail, ownAddress)
          ? "outbound"
          : "inbound";
      const threadId = thread.id;
      const msgRows = await tx.execute(sql`
        INSERT INTO email_messages
          (thread_id, account_id, gmail_message_id, direction, from_email, from_name, to_emails, cc_emails, subject, snippet, body_html, body_text, sent_at)
        VALUES (
          ${threadId}, ${args.accountId}, ${parsed.gmailMessageId}, ${direction}, ${parsed.fromEmail}, ${parsed.fromName},
          ${JSON.stringify(parsed.toEmails)}::jsonb, ${JSON.stringify(parsed.ccEmails)}::jsonb,
          ${parsed.subject}, ${parsed.snippet}, ${parsed.bodyHtml}, ${parsed.bodyText}, ${parsed.sentAt}
        )
        ON CONFLICT (account_id, gmail_message_id) DO NOTHING
        RETURNING id
      `);
      args.signal.throwIfAborted();
      const row = msgRows.rows[0] as { id: string } | undefined;
      if (row === undefined) return false;

      if (mailbox.kind === "team" && direction === "inbound") {
        const isNewArrival =
          args.importedAt === undefined ||
          (parsed.sentAt !== null && parsed.sentAt > args.importedAt);
        await tx.execute(
          sql`UPDATE email_threads SET last_inbound_at=GREATEST(last_inbound_at, ${parsed.sentAt}), archived_at=${isNewArrival ? sql`NULL` : sql`archived_at`} WHERE id=${threadId}`,
        );
        args.signal.throwIfAborted();
      }
      for (const a of parsed.attachments) {
        await tx.execute(sql`
          INSERT INTO email_message_attachments (message_id, account_id, gmail_attachment_id, filename, mime_type, size_bytes)
          VALUES (${row.id}, ${args.accountId}, ${a.gmailAttachmentId}, ${a.filename}, ${a.mimeType}, ${a.sizeBytes})
        `);
        args.signal.throwIfAborted();
      }

      for (const recipient of recipients)
        await publishEvent(
          tx,
          {
            v: 1,
            channel: wsChannel.user(recipient.user_id),
            ts: new Date().toISOString(),
            actorId: null,
            type: "email_arrived",
            data: { messageId: row.id, threadId, accountId: args.accountId },
          },
          args.signal,
        );

      if (thread.dealId !== null && isSelfSent(parsed.fromEmail, ownAddress) === false) {
        arrivals.push({
          dealId: thread.dealId,
          threadId,
          messageId: row.id,
          subject: parsed.subject,
          fromEmail: parsed.fromEmail,
        });
      }
      return true;
    });

    args.signal.throwIfAborted();
    if (inserted) applied += 1;
  }

  await notifyArrivals(args.db, arrivals, args.signal);

  return ok(applied);
}

interface DealEmailArrival {
  dealId: string;
  threadId: string;
  messageId: string;
  subject: string | null;
  fromEmail: string;
}

function isSelfSent(fromEmail: string, ownAddress: string | null): boolean {
  if (ownAddress === null) return false;
  return fromEmail.trim().toLowerCase() === ownAddress.trim().toLowerCase();
}

async function notifyArrivals(
  db: Db,
  arrivals: DealEmailArrival[],
  signal: AbortSignal,
): Promise<void> {
  for (const a of arrivals) {
    try {
      await notifyDealEmailReceived(db, { ...a, signal });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      console.warn("notifyDealEmailReceived failed (best-effort)", { messageId: a.messageId, err });
    }
  }
}
