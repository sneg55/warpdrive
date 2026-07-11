import { sql } from "drizzle-orm";
import type { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { ok, type Result } from "@/types/result";
import type { GmailClient } from "./gmailClient";
import type { SendPayload } from "./outboxClaim";
import type { SendEmailInput } from "./send";
import { storeOutboundCopy } from "./sendStore";
import { backfillTokens } from "./tracking";

interface ReplayRepairArgs {
  attemptId: string;
  accountId: string;
  fromEmail: string;
  gmail: GmailClient;
  signal: AbortSignal;
}

// F17: a replay of an already-sent attempt used to return "sent" straight from the
// email_send_attempts row. If Gmail accepted the send (attempt marked sent) but the local
// copy / token backfill failed, or the process crashed after markSent, the CRM would
// permanently diverge from Gmail: no email_messages/thread row, no tracking tokens.
//
// Instead, idempotently repair on replay: if the local copy is missing, re-store it
// (storeOutboundCopy upserts on (account_id, gmail_message_id)) and backfill tokens. The
// repair reads the STORED payload (the source of truth for what was actually sent), never
// client input, and never re-sends to Gmail. Returns the gmail message id for the reply.
export async function ensureLocalCopyForReplay(
  db: Db,
  args: ReplayRepairArgs,
): Promise<Result<{ messageId?: string }, AppError>> {
  const row = (
    await db.execute(sql`
      SELECT gmail_message_id, idempotency_key, payload
      FROM email_send_attempts WHERE id=${args.attemptId}
    `)
  ).rows[0] as
    | { gmail_message_id: string | null; idempotency_key: string; payload: SendPayload }
    | undefined;
  // No gmail id means nothing reached Gmail; there is no accepted send to reconcile against.
  if (row === undefined || row.gmail_message_id === null) {
    return ok({ messageId: row?.gmail_message_id ?? undefined });
  }
  const gmailMessageId = row.gmail_message_id;
  args.signal.throwIfAborted();

  // Already reconciled: the local copy exists. Skip the redundant Gmail fetch + upsert.
  const existing = (
    await db.execute(sql`
      SELECT id FROM email_messages
      WHERE account_id=${args.accountId} AND gmail_message_id=${gmailMessageId}
    `)
  ).rows[0] as { id: string } | undefined;
  if (existing !== undefined) return ok({ messageId: gmailMessageId });

  // Repair from the stored payload. The payload carries the resolved trackOpens/trackLinks
  // that were written at send time (never the raw client field). Derive resolvedTrackingEnabled
  // from those flags; fall back to the legacy trackingEnabled field for old rows.
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
  const stored = await storeOutboundCopy(db, {
    accountId: args.accountId,
    fromEmail: args.fromEmail,
    gmailMessageId,
    input,
    resolvedTrackingEnabled,
    bodyHtml: payload.html,
    gmail: args.gmail,
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
