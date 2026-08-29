import { sql } from "drizzle-orm";
import { AppError } from "@/constants/errorIds";
import { wsChannel } from "@/constants/wsChannels";
import type { Db } from "@/db/client";
import { notifyDealEmailReceived } from "@/features/notifications/wire";
import type { AuthUser } from "@/features/permissions/types";
import { publishEvent } from "@/server/notify";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import { ok, type Result } from "@/types/result";
import type { GmailClient } from "./gmailClient";
import { resolveLink } from "./linking";
import { messageGoneFromMailbox } from "./messageGone";
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

  // Gmail history replays messages we SENT as messagesAdded, and every applied message is
  // written with direction 'inbound', so the sender address is the only thing separating an
  // arrival from our own reply.
  const ownAddress = await mailboxAddress(args.db, args.accountId, args.signal);

  // Deal-linked arrivals, collected inside the loop and notified after every tx has committed
  // so a notification never outlives a rolled-back message insert.
  const arrivals: DealEmailArrival[] = [];

  for (const id of ids) {
    const fetched = await args.gmail.getMessage({ id, signal: args.signal });
    args.signal.throwIfAborted();
    if (!fetched.ok) {
      // A 404 means the message is gone from the mailbox (permanently deleted between the history
      // entry naming it and this fetch). There is nothing to store and no later tick can fetch it,
      // so skip it and let the page finish. Returning here instead wedged the cursor: the page
      // never completed, so last_history_id never advanced, so every following tick re-listed the
      // same page, re-fetched the same dead id, and took the same 404. That is how one deleted
      // message stopped a mailbox syncing for eight hours. applyTrashTransitions already treats a
      // getThread 404 the same way, for the same reason.
      if (messageGoneFromMailbox(fetched.error)) continue;
      return fetched;
    }
    const parsed = parseGmailMessage(fetched.value);
    args.touchedThreadIds?.add(parsed.threadId);

    const inserted = await args.db.transaction(async (tx) => {
      const thread = await upsertThread(tx, args, parsed.threadId, parsed);
      const threadId = thread.id;
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

// The address this mailbox sends from. Null when the account row is gone, in which case the
// self-sent check simply does not fire.
async function mailboxAddress(
  db: Db,
  accountId: string,
  signal: AbortSignal,
): Promise<string | null> {
  signal.throwIfAborted();
  const rows = await db.execute(
    sql`SELECT email_address FROM email_accounts WHERE id = ${accountId}`,
  );
  const row = rows.rows[0] as { email_address: string } | undefined;
  return row?.email_address ?? null;
}

// Best-effort, after every message tx has committed: a notification failure must never
// undo an applied message or abort the rest of the sync page.
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
): Promise<{ id: string; dealId: string | null }> {
  const existing = await tx.execute(
    sql`SELECT id, deal_id FROM email_threads WHERE account_id=${args.accountId} AND gmail_thread_id=${gmailThreadId}`,
  );
  const found = existing.rows[0] as { id: string; deal_id: string | null } | undefined;
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
    return { id: found.id, dealId: found.deal_id };
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
    RETURNING id, deal_id
  `);
  // deal_id comes from RETURNING, not from the local variable: on the DO UPDATE path the row
  // was inserted concurrently and its stored link is the one that counts.
  const row = created.rows[0] as { id: string; deal_id: string | null } | undefined;
  if (row === undefined) {
    throw new AppError("E_DB_002", "email_threads upsert returned no row", { gmailThreadId });
  }
  return { id: row.id, dealId: row.deal_id };
}
