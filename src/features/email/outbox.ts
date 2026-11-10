import { sql } from "drizzle-orm";
import { RECONCILE_WINDOW_MS } from "@/constants/email";
import { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { StorageClient } from "@/features/files/storage";
import { err, ok, type Result } from "@/types/result";
import type { GmailClient } from "./gmailClient";
import { buildMime, type MimeAttachment, toRawBase64 } from "./mime";
import { assertAttemptSender } from "./outboxAccess";
import { claim, loadAttempt, loadSendInputs, type SendPayload, stamp } from "./outboxClaim";
import { markSent, reconcile, type SendOutcome } from "./outboxReconcile";
import { type ReplyThreadHeaders, replyThreadHeaders } from "./replyHeaders";

export { enqueueSend } from "./outboxEnqueue";

async function loadReplyThreadHeaders(
  gmail: GmailClient,
  parentGmailMessageId: string | null,
  gmailThreadId: string | null,
  signal: AbortSignal,
): Promise<ReplyThreadHeaders> {
  if (gmailThreadId === null || parentGmailMessageId === null) return {};
  const parent = await gmail.getMessage({ id: parentGmailMessageId, signal });
  signal.throwIfAborted();
  if (!parent.ok) return {};
  return replyThreadHeaders(parent.value);
}

function isDefiniteRejection(error: AppError): boolean {
  const status = error.context?.status;
  return typeof status === "number" && status >= 400 && status < 500;
}

export async function processSendAttempt(
  db: Db,
  args: {
    accountId: string;
    idempotencyKey: string;
    gmail: GmailClient;
    storage: StorageClient;
    signal: AbortSignal;
    now?: number;
    windowMs?: number;
  },
): Promise<Result<SendOutcome, AppError>> {
  args.signal.throwIfAborted();
  const now = args.now ?? Date.now();
  const windowMs = args.windowMs ?? RECONCILE_WINDOW_MS;

  const existing = await loadAttempt(db, args.accountId, args.idempotencyKey, args.signal);
  if (existing === undefined) {
    return err(new AppError("E_DB_002", "processSendAttempt: no attempt row", args));
  }
  if (existing.status === "sent") {
    return ok({ status: "sent", gmailMessageId: existing.gmail_message_id ?? undefined });
  }

  if (existing.send_started_at !== null) {
    return reconcile(db, {
      attempt: existing,
      gmail: args.gmail,
      signal: args.signal,
      now,
      windowMs,
    });
  }

  const access = await assertAttemptSender(db, existing.id, args.signal);
  if (!access.ok) return access;
  const token = await claim(db, existing.id, args.signal);
  if (token === null)
    return err(new AppError("E_GMAIL_008", "attempt not claimable", { id: existing.id }));

  const claimed = await loadAttempt(db, args.accountId, args.idempotencyKey, args.signal);
  if (claimed !== undefined && claimed.send_started_at !== null) {
    return reconcile(db, {
      attempt: claimed,
      gmail: args.gmail,
      signal: args.signal,
      now,
      windowMs,
    });
  }

  const inputs = await loadSendInputs(db, existing.id, args.accountId, args.signal);
  if (inputs === undefined) return err(new AppError("E_DB_002", "send inputs not found", args));
  args.signal.throwIfAborted();
  const { from, payload, gmailThreadId, parentGmailMessageId } = inputs;

  const threading = await loadReplyThreadHeaders(
    args.gmail,
    parentGmailMessageId,
    gmailThreadId,
    args.signal,
  );

  const stamped = await stamp(db, existing.id, token, args.signal);
  if (!stamped) return err(new AppError("E_GMAIL_008", "stamp race lost", { id: existing.id }));

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
    inReplyTo: threading.inReplyTo,
    references: threading.references,
    attachments: attResult.value.length > 0 ? attResult.value : undefined,
  });
  const sent = await args.gmail.sendRaw({
    rawBase64: toRawBase64(mime),
    threadId: gmailThreadId ?? undefined,
    signal: args.signal,
  });
  args.signal.throwIfAborted();

  if (!sent.ok) {
    if (isDefiniteRejection(sent.error)) {
      await db.execute(sql`
        UPDATE email_send_attempts
        SET status='failed', error_id=${sent.error.id}, send_started_at=NULL, claim_token=NULL
        WHERE id=${existing.id}
      `);
    } else {
      await db.execute(sql`
        UPDATE email_send_attempts SET status='failed', error_id=${sent.error.id} WHERE id=${existing.id}
      `);
    }
    args.signal.throwIfAborted();
    return ok({ status: "failed" });
  }

  await markSent(db, existing.id, sent.value.id, args.signal);
  return ok({ status: "sent", gmailMessageId: sent.value.id });
}

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
