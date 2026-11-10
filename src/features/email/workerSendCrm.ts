import { sql } from "drizzle-orm";
import { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";
import type { GmailClient } from "./gmailClient";
import type { SendPayload } from "./outboxClaim";
import type { SendEmailInput } from "./send";
import { storeOutboundCopy } from "./sendStore";
import { hydrateOwner } from "./syncCursor";
import { backfillTokens } from "./tracking";

export interface WorkerSendCrmArgs {
  accountId: string;
  idempotencyKey: string;
  gmailMessageId: string;
  gmail: GmailClient;
  signal: AbortSignal;
}

interface AttemptCrmRow {
  id: string;
  payload: SendPayload;
  from_email: string;
  user_id: string;
}

async function loadAttemptCrmRow(
  db: Db,
  accountId: string,
  idempotencyKey: string,
  signal: AbortSignal,
): Promise<AttemptCrmRow | undefined> {
  signal.throwIfAborted();
  const res = await db.execute(sql`
    SELECT s.id, s.payload, a.email_address AS from_email, COALESCE(s.payload->>'actorId', a.user_id::text) AS user_id
    FROM email_send_attempts s
    JOIN email_accounts a ON a.id = s.account_id
    WHERE s.account_id = ${accountId} AND s.idempotency_key = ${idempotencyKey}
  `);
  signal.throwIfAborted();
  return res.rows[0] as AttemptCrmRow | undefined;
}

export async function performWorkerSendCrm(
  db: Db,
  args: WorkerSendCrmArgs,
): Promise<Result<void, AppError>> {
  const row = await loadAttemptCrmRow(db, args.accountId, args.idempotencyKey, args.signal);
  if (row === undefined) {
    return err(
      new AppError("E_DB_002", "performWorkerSendCrm: attempt row not found", {
        accountId: args.accountId,
        idempotencyKey: args.idempotencyKey,
      }),
    );
  }

  const payload = row.payload;
  const resolvedTrackingEnabled =
    payload.trackOpens === true ||
    payload.trackLinks === true ||
    (payload.trackingEnabled ?? false);

  const input: SendEmailInput = {
    accountId: args.accountId,
    idempotencyKey: args.idempotencyKey,
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
    fromEmail: row.from_email,
    gmailMessageId: args.gmailMessageId,
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
    sendAttemptId: row.id,
    messageId: stored.value.messageId,
    signal: args.signal,
  });

  return ok(undefined);
}
