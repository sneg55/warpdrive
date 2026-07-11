import { sql } from "drizzle-orm";
import { AppError } from "@/constants/errorIds";
import { wsChannel } from "@/constants/wsChannels";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { publishEvent } from "@/server/notify";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import { ok, type Result } from "@/types/result";
import type { GmailClient } from "./gmailClient";
import { resolveLink } from "./linking";
import { parseGmailMessage } from "./mimeParse";

// Apply a list of gmail message ids: fetch + parse each, upsert the thread FIRST
// (composite FK requires it), run resolveLink on a new thread to set person/deal,
// then upsert the message and publish email_arrived in the SAME tx.
// Idempotent: ON CONFLICT DO NOTHING on both unique keys so a redelivered list is a
// no-op. Returns the count of messages newly inserted.
export async function applyMessageIds(
  args: {
    db: Db;
    accountId: string;
    owner: AuthUser;
    gmail: GmailClient;
    signal: AbortSignal;
    // When provided, the gmail THREAD id of every added message is collected here so the caller can
    // re-evaluate each touched thread's whole-thread trash state (P4). Both directions need it: a
    // new message arriving already in TRASH (a Gmail filter with "Delete it") should trash the
    // thread, and a new inbox message on a previously-trashed thread (a reply) should un-trash it,
    // and the added message's own label does not distinguish those, so ALL touched threads reconcile.
    touchedThreadIds?: Set<string>;
  },
  ids: string[],
): Promise<Result<number, AppError>> {
  args.signal.throwIfAborted();
  let applied = 0;

  for (const id of ids) {
    const fetched = await args.gmail.getMessage({ id, signal: args.signal });
    args.signal.throwIfAborted();
    if (!fetched.ok) return fetched;
    const parsed = parseGmailMessage(fetched.value);
    args.touchedThreadIds?.add(parsed.threadId);

    const inserted = await args.db.transaction(async (tx) => {
      const threadId = await upsertThread(tx, args, parsed.threadId, parsed);
      const msgRows = await tx.execute(sql`
        INSERT INTO email_messages
          (thread_id, account_id, gmail_message_id, direction, from_email, from_name, to_emails, cc_emails, subject, snippet, body_html, body_text, sent_at)
        VALUES (
          ${threadId}, ${args.accountId}, ${parsed.gmailMessageId}, 'inbound', ${parsed.fromEmail}, ${parsed.fromName},
          ${JSON.stringify(parsed.toEmails)}::jsonb, ${JSON.stringify(parsed.ccEmails)}::jsonb,
          ${parsed.subject}, ${parsed.snippet}, ${parsed.bodyHtml}, ${parsed.bodyText}, ${parsed.sentAt}
        )
        ON CONFLICT (account_id, gmail_message_id) DO NOTHING
        RETURNING id
      `);
      const row = msgRows.rows[0] as { id: string } | undefined;
      if (row === undefined) return false; // already applied: no-op, no event

      for (const a of parsed.attachments) {
        await tx.execute(sql`
          INSERT INTO email_message_attachments (message_id, account_id, gmail_attachment_id, filename, mime_type, size_bytes)
          VALUES (${row.id}, ${args.accountId}, ${a.gmailAttachmentId}, ${a.filename}, ${a.mimeType}, ${a.sizeBytes})
        `);
      }

      // Publish in the SAME tx so a rollback emits nothing (ops A4). Ids only.
      await publishEvent(
        tx,
        {
          v: 1,
          channel: wsChannel.user(args.owner.id),
          ts: new Date().toISOString(),
          actorId: null,
          type: "email_arrived",
          data: { messageId: row.id, threadId, accountId: args.accountId },
        },
        args.signal,
      );
      return true;
    });

    if (inserted) applied += 1;
  }

  return ok(applied);
}

// Upsert the thread on (account_id, gmail_thread_id). On a NEW thread, run resolveLink
// to set person_id/deal_id scoped to the owner's visibility. Returns the internal id.
async function upsertThread(
  tx: DbOrTx,
  args: { accountId: string; owner: AuthUser; signal: AbortSignal },
  gmailThreadId: string,
  parsed: {
    subject: string | null;
    fromEmail: string;
    participants: string[];
    sentAt: Date | null;
  },
): Promise<string> {
  const existing = await tx.execute(
    sql`SELECT id FROM email_threads WHERE account_id=${args.accountId} AND gmail_thread_id=${gmailThreadId}`,
  );
  const found = existing.rows[0] as { id: string } | undefined;
  if (found !== undefined) {
    // Advance last_message_at so a reply reorders the inbox (listInbox sorts by it DESC).
    // GREATEST keeps the newest time and tolerates a null column or a null parsed date (F30).
    if (parsed.sentAt !== null) {
      await tx.execute(sql`
        UPDATE email_threads
        SET last_message_at = GREATEST(last_message_at, ${parsed.sentAt}), updated_at = now()
        WHERE id = ${found.id}
      `);
    }
    return found.id;
  }

  const link = await resolveLink(
    tx,
    { owner: args.owner, participants: parsed.participants, fromEmail: parsed.fromEmail },
    args.signal,
  );
  const personId = link.kind === "linked" ? link.personId : null;
  const dealId = link.kind === "linked" ? link.dealId : null;

  const created = await tx.execute(sql`
    INSERT INTO email_threads (gmail_thread_id, account_id, subject, person_id, deal_id, last_message_at)
    VALUES (${gmailThreadId}, ${args.accountId}, ${parsed.subject}, ${personId}, ${dealId}, ${parsed.sentAt})
    ON CONFLICT (account_id, gmail_thread_id) DO UPDATE SET updated_at=now()
    RETURNING id
  `);
  const row = created.rows[0] as { id: string } | undefined;
  if (row === undefined) {
    throw new AppError("E_DB_002", "email_threads upsert returned no row", { gmailThreadId });
  }
  return row.id;
}
