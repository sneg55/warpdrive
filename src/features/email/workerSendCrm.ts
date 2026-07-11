// Post-send CRM copy + token backfill for the worker send path.
// The interactive path (send.ts) has all context in scope and calls storeOutboundCopy
// + backfillTokens directly. The worker path only has (accountId, idempotencyKey,
// gmail, signal), so this helper loads what it needs from the DB and delegates.
// Idempotent: storeOutboundCopy upserts on (account_id, gmail_message_id) and
// backfillTokens only updates rows where message_id IS NULL, so calling twice is safe.
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

// Load the attempt row joined with the account email. Returns undefined when the
// row is missing (should not happen after a successful processSendAttempt, but we
// guard defensively rather than throwing).
async function loadAttemptCrmRow(
  db: Db,
  accountId: string,
  idempotencyKey: string,
): Promise<AttemptCrmRow | undefined> {
  const res = await db.execute(sql`
    SELECT s.id, s.payload, a.email_address AS from_email, a.user_id AS user_id
    FROM email_send_attempts s
    JOIN email_accounts a ON a.id = s.account_id
    WHERE s.account_id = ${accountId} AND s.idempotency_key = ${idempotencyKey}
  `);
  return res.rows[0] as AttemptCrmRow | undefined;
}

// Store the CRM copy and backfill tracking tokens for a worker-delivered send.
// Mirrors the identical sequence in send.ts (runSend step g) but reconstructs the
// needed context from the DB rather than from the in-scope runSend variables.
export async function performWorkerSendCrm(
  db: Db,
  args: WorkerSendCrmArgs,
): Promise<Result<void, AppError>> {
  const row = await loadAttemptCrmRow(db, args.accountId, args.idempotencyKey);
  if (row === undefined) {
    return err(
      new AppError("E_DB_002", "performWorkerSendCrm: attempt row not found", {
        accountId: args.accountId,
        idempotencyKey: args.idempotencyKey,
      }),
    );
  }

  const payload = row.payload;
  // Derive resolvedTrackingEnabled from the resolved flags written at enqueue time.
  // Fall back to legacy trackingEnabled for rows written before the split.
  const resolvedTrackingEnabled =
    payload.trackOpens === true ||
    payload.trackLinks === true ||
    (payload.trackingEnabled ?? false);

  // Reconstruct the minimal SendEmailInput surface storeOutboundCopy needs.
  // It only reads: accountId, to, cc, subject (for thread upsert), and bodyHtml.
  // The idempotencyKey is not used inside storeOutboundCopy itself.
  const input: SendEmailInput = {
    accountId: args.accountId,
    idempotencyKey: args.idempotencyKey,
    to: payload.to,
    cc: payload.cc,
    subject: payload.subject,
    bodyHtml: payload.html,
  };

  // Link a NEW thread the same way the interactive path does. A scheduled send carries no
  // explicit composer context in its payload, so we rely on recipient-based auto-linking,
  // scoped to the mailbox owner's visibility (hydrated the same way the sync path does). A
  // hydration failure must not lose the CRM copy, so fall back to an unlinked store.
  const owner = await hydrateOwner(db, row.user_id, args.signal);
  const link = owner.ok
    ? {
        owner: owner.value,
        recipients: [...payload.to, ...(payload.cc ?? []), ...(payload.bcc ?? [])],
        explicitPersonId: null,
        explicitDealId: null,
      }
    : undefined;

  const stored = await storeOutboundCopy(db, {
    accountId: args.accountId,
    fromEmail: row.from_email,
    gmailMessageId: args.gmailMessageId,
    input,
    resolvedTrackingEnabled,
    bodyHtml: payload.html,
    gmail: args.gmail,
    link,
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
