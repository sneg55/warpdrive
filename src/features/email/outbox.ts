import { sql } from "drizzle-orm";
import { env } from "@/config/env";
import { RECONCILE_WINDOW_MS } from "@/constants/email";
import { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { StorageClient } from "@/features/files/storage";
import { err, ok, type Result } from "@/types/result";
import type { GmailClient } from "./gmailClient";
import { buildMime, deriveMessageId, type MimeAttachment, toRawBase64 } from "./mime";
import { claim, loadAttempt, loadSendInputs, type SendPayload, stamp } from "./outboxClaim";
import { markSent, reconcile, type SendOutcome } from "./outboxReconcile";

// Classify a sendRaw failure. A definite pre-acceptance rejection is an HTTP 4xx: Gmail
// rejected the request and did NOT accept the message, so a retry is a safe fresh send.
// Everything else (5xx, network/timeout, or a schema-parse failure which only occurs on a
// 2xx body Gmail already accepted) is AMBIGUOUS and must reconcile, never blind re-send.
function isDefiniteRejection(error: AppError): boolean {
  const status = error.context?.status;
  return typeof status === "number" && status >= 400 && status < 500;
}

// Enqueue a send. The Message-ID header is the DETERMINISTIC id derived from
// (accountId, idempotencyKey): stable across retries so reconciliation can find a
// crashed-but-accepted send. Idempotent on (account_id, idempotency_key); if a sent
// row already exists it is reported as a replay.
export async function enqueueSend(
  db: Db,
  args: {
    accountId: string;
    idempotencyKey: string;
    payload: SendPayload;
    threadId?: string | null;
    scheduledAt?: Date | null;
  },
): Promise<Result<{ attemptId: string; replay: boolean }, AppError>> {
  const header = deriveMessageId({
    accountId: args.accountId,
    idempotencyKey: args.idempotencyKey,
    domain: env.GOOGLE_WORKSPACE_DOMAIN,
  });
  await db.execute(sql`
    INSERT INTO email_send_attempts (idempotency_key, message_id_header, account_id, thread_id, payload, status, scheduled_at)
    VALUES (${args.idempotencyKey}, ${header}, ${args.accountId}, ${args.threadId ?? null}, ${JSON.stringify(args.payload)}::jsonb, 'pending', ${args.scheduledAt ?? null})
    ON CONFLICT (account_id, idempotency_key) DO NOTHING
  `);

  const row = (
    await db.execute(sql`
      SELECT id, status FROM email_send_attempts
      WHERE account_id=${args.accountId} AND idempotency_key=${args.idempotencyKey}
    `)
  ).rows[0] as { id: string; status: string } | undefined;
  if (row === undefined) {
    return err(new AppError("E_DB_002", "enqueueSend found no attempt row", args));
  }
  return ok({ attemptId: row.id, replay: row.status === "sent" });
}

// ops B6 steps 2 to 4. Exactly-once-effect under crashes: never blind re-send a row
// that may already have been accepted by Gmail; reconcile by deterministic Message-ID.
export async function processSendAttempt(
  db: Db,
  args: {
    accountId: string;
    idempotencyKey: string;
    gmail: GmailClient;
    // storage is required: callers must always wire in real (or fake) storage so that
    // attachment sends never silently fail. The TypeScript compiler enforces this.
    storage: StorageClient;
    signal: AbortSignal;
    now?: number;
    windowMs?: number;
  },
): Promise<Result<SendOutcome, AppError>> {
  args.signal.throwIfAborted();
  const now = args.now ?? Date.now();
  const windowMs = args.windowMs ?? RECONCILE_WINDOW_MS;

  const existing = await loadAttempt(db, args.accountId, args.idempotencyKey);
  if (existing === undefined) {
    return err(new AppError("E_DB_002", "processSendAttempt: no attempt row", args));
  }
  // (a) replay short-circuit: already sent.
  if (existing.status === "sent") {
    return ok({ status: "sent", gmailMessageId: existing.gmail_message_id ?? undefined });
  }

  // (c) branch on send_started_at: a stamped row may have been accepted -> reconcile,
  // never blind re-send. Do this BEFORE claiming so a stamped row can never re-send.
  if (existing.send_started_at !== null) {
    return reconcile(db, {
      attempt: existing,
      gmail: args.gmail,
      signal: args.signal,
      now,
      windowMs,
    });
  }

  // (b) token-guarded claim. A lost claim is expected contention (E_GMAIL_008), not an
  // API failure, so it does not pollute API-exhaustion metrics.
  const token = await claim(db, existing.id, args.signal);
  if (token === null)
    return err(new AppError("E_GMAIL_008", "attempt not claimable", { id: existing.id }));

  // Re-check under the claim: another worker may have stamped between load and claim.
  const claimed = await loadAttempt(db, args.accountId, args.idempotencyKey);
  if (claimed !== undefined && claimed.send_started_at !== null) {
    return reconcile(db, {
      attempt: claimed,
      gmail: args.gmail,
      signal: args.signal,
      now,
      windowMs,
    });
  }

  // (d) stamp send_started_at and COMMIT before any Gmail I/O. A lost stamp race is
  // expected contention (E_GMAIL_008), not an API failure.
  const stamped = await stamp(db, existing.id, token, args.signal);
  if (!stamped) return err(new AppError("E_GMAIL_008", "stamp race lost", { id: existing.id }));

  // (e) build MIME with the FIXED Message-ID, then send with NO DB tx held open.
  const inputs = await loadSendInputs(db, existing.id, args.accountId);
  if (inputs === undefined) return err(new AppError("E_DB_002", "send inputs not found", args));
  // An aborted request must not proceed to actually send.
  args.signal.throwIfAborted();
  const { from, payload } = inputs;

  const attResult = await fetchAttachmentBytes(payload, args.storage, args.signal);
  if (!attResult.ok) return attResult;

  const mime = buildMime({
    from,
    to: payload.to,
    cc: payload.cc,
    bcc: payload.bcc,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    messageId: existing.message_id_header,
    attachments: attResult.value.length > 0 ? attResult.value : undefined,
  });
  const sent = await args.gmail.sendRaw({ rawBase64: toRawBase64(mime), signal: args.signal });
  args.signal.throwIfAborted();

  if (!sent.ok) {
    if (isDefiniteRejection(sent.error)) {
      // DEFINITE pre-acceptance rejection (HTTP 4xx): Gmail did not accept the message, so
      // it is safe to retry as a fresh send. Clear send_started_at/claim_token (F12) so the
      // next attempt re-claims and re-sends instead of routing into reconcile (which would
      // search, find nothing, and eventually needs_review) and stranding a retryable send.
      await db.execute(sql`
        UPDATE email_send_attempts
        SET status='failed', error_id=${sent.error.id}, send_started_at=NULL, claim_token=NULL
        WHERE id=${existing.id}
      `);
    } else {
      // AMBIGUOUS failure (5xx, timeout, or a schema-parse failure on a 2xx body): Gmail may
      // have accepted the message. KEEP send_started_at so the next attempt reconciles by
      // the deterministic Message-ID rather than blind re-sending a possibly-delivered email
      // (F13). This is the original exactly-once path.
      await db.execute(sql`
        UPDATE email_send_attempts SET status='failed', error_id=${sent.error.id} WHERE id=${existing.id}
      `);
    }
    return ok({ status: "failed" });
  }

  await markSent(db, existing.id, sent.value.id, args.signal);
  return ok({ status: "sent", gmailMessageId: sent.value.id });
}

// Fetch raw bytes for every attachment in the payload from storage.
async function fetchAttachmentBytes(
  payload: SendPayload,
  storage: StorageClient,
  signal: AbortSignal,
): Promise<Result<MimeAttachment[], AppError>> {
  const result: MimeAttachment[] = [];
  for (const att of payload.attachments ?? []) {
    const bytes = await storage.getObjectBytes(att.s3Key, signal);
    if (!bytes.ok) return bytes;
    result.push({ filename: att.filename, contentType: att.contentType, bytes: bytes.value });
  }
  return ok(result);
}
