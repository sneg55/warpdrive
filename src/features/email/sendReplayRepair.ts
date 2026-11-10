import { sql } from "drizzle-orm";
import type { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { ok, type Result } from "@/types/result";
import type { GmailClient } from "./gmailClient";
import type { SendPayload } from "./outboxClaim";
import type { SendEmailInput } from "./send";
import { storeOutboundCopy } from "./sendStore";
import { hydrateOwner } from "./syncCursor";
import { backfillTokens } from "./tracking";

interface ReplayRepairArgs {
  attemptId: string;
  accountId: string;
  fromEmail: string;
  gmail: GmailClient;
  signal: AbortSignal;
}

export async function ensureLocalCopyForReplay(
  db: Db,
  args: ReplayRepairArgs,
): Promise<Result<{ messageId?: string }, AppError>> {
  const row = (
    await db.execute(sql`
      SELECT s.gmail_message_id, s.idempotency_key, s.payload, COALESCE(s.payload->>'actorId', a.user_id::text) AS user_id
      FROM email_send_attempts s
      JOIN email_accounts a ON a.id = s.account_id
      WHERE s.id=${args.attemptId}
    `)
  ).rows[0] as
    | {
        gmail_message_id: string | null;
        idempotency_key: string;
        payload: SendPayload;
        user_id: string;
      }
    | undefined;
  if (row === undefined || row.gmail_message_id === null) {
    return ok({ messageId: row?.gmail_message_id ?? undefined });
  }
  const gmailMessageId = row.gmail_message_id;
  args.signal.throwIfAborted();

  const existing = (
    await db.execute(sql`
      SELECT id FROM email_messages
      WHERE account_id=${args.accountId} AND gmail_message_id=${gmailMessageId}
    `)
  ).rows[0] as { id: string } | undefined;
  args.signal.throwIfAborted();
  if (existing !== undefined) {
    await db.execute(sql`UPDATE email_messages SET sent_by_user_id=${row.user_id}
      WHERE id=${existing.id} AND sent_by_user_id IS NULL`);
    args.signal.throwIfAborted();
    return ok({ messageId: gmailMessageId });
  }

  const payload = row.payload;
  const resolvedTrackingEnabled =
    payload.trackOpens === true ||
    payload.trackLinks === true ||
    (payload.trackingEnabled ?? false);
  const input: SendEmailInput = {
    accountId: args.accountId,
    idempotencyKey: row.idempotency_key,
    to: payload.to,
    cc: payload.cc,
    subject: payload.subject,
    bodyHtml: payload.html,
  };

  const owner = await hydrateOwner(db, row.user_id, args.signal);
  const link = owner.ok
    ? {
        owner: owner.value,
        recipients: [...payload.to, ...(payload.cc ?? []), ...(payload.bcc ?? [])],
        explicitPersonId: payload.linkPersonId ?? null,
        explicitDealId: payload.linkDealId ?? null,
      }
    : undefined;

  const stored = await storeOutboundCopy(db, {
    sentByUserId: row.user_id,
    accountId: args.accountId,
    fromEmail: args.fromEmail,
    gmailMessageId,
    input,
    resolvedTrackingEnabled,
    bodyHtml: payload.html,
    gmail: args.gmail,
    link,
    visibility: payload.visibility ?? null,
    signal: args.signal,
  });
  if (!stored.ok) return stored;
  await backfillTokens(db, {
    sendAttemptId: args.attemptId,
    messageId: stored.value.messageId,
    signal: args.signal,
  });
  return ok({ messageId: gmailMessageId });
}
