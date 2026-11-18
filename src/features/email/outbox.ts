import { RECONCILE_WINDOW_MS } from "@/constants/email";
import { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { StorageClient } from "@/features/files/storage";
import { err, ok, type Result } from "@/types/result";
import type { MimeAttachment } from "./mime";
import { assertAttemptSender } from "./outboxAccess";
import { claim, loadAttempt, loadSendInputs, type SendPayload, stamp } from "./outboxClaim";
import {
  applySendOutcome,
  type OutcomeRun,
  outcomeFromSendError,
  requeueWaiting,
} from "./outboxOutcome";
import { type AttemptRow, reconcile, type SendOutcome } from "./outboxReconcile";
import type { MailProvider, ProviderSendOutcome } from "./provider/types";
import type { ReplyThreadHeaders } from "./replyHeaders";
import { checkRecipientLimit } from "./sendInput";

export { enqueueSend } from "./outboxEnqueue";

async function loadReplyThreadHeaders(
  provider: MailProvider,
  parentGmailMessageId: string | null,
  gmailThreadId: string | null,
  signal: AbortSignal,
): Promise<ReplyThreadHeaders> {
  if (gmailThreadId === null || parentGmailMessageId === null) return {};
  return provider.replyHeaders({ parentProviderMessageId: parentGmailMessageId, signal });
}

interface SendRun extends OutcomeRun {
  provider: MailProvider;
  storage: StorageClient;
}

export async function processSendAttempt(
  db: Db,
  args: {
    accountId: string;
    idempotencyKey: string;
    provider: MailProvider;
    storage: StorageClient;
    signal: AbortSignal;
    now?: number;
    windowMs?: number;
  },
): Promise<Result<SendOutcome, AppError>> {
  args.signal.throwIfAborted();
  const run: SendRun = {
    ...args,
    now: args.now ?? Date.now(),
    windowMs: args.windowMs ?? RECONCILE_WINDOW_MS,
  };

  const existing = await loadAttempt(db, args.accountId, args.idempotencyKey, args.signal);
  if (existing === undefined) {
    return err(new AppError("E_DB_002", "processSendAttempt: no attempt row", args));
  }
  if (existing.status === "sent") {
    return ok({ status: "sent", gmailMessageId: existing.gmail_message_id ?? undefined });
  }
  if (args.provider.idempotentSend && existing.status === "failed") return ok({ status: "failed" });
  if (existing.send_started_at !== null) return settleStarted(db, existing, run);

  const access = await assertAttemptSender(db, existing.id, args.signal);
  if (!access.ok) return access;
  const token = await claim(db, existing.id, args.signal);
  if (token === null) {
    if (existing.status === "waiting_for_limit") return requeueWaiting(db, existing.id, run);
    return err(new AppError("E_GMAIL_008", "attempt not claimable", { id: existing.id }));
  }

  const claimed = await loadAttempt(db, args.accountId, args.idempotencyKey, args.signal);
  if (claimed !== undefined && claimed.send_started_at !== null) {
    return settleStarted(db, claimed, run);
  }
  return deliver(db, existing, run, token);
}

async function settleStarted(
  db: Db,
  attempt: AttemptRow,
  run: SendRun,
): Promise<Result<SendOutcome, AppError>> {
  if (!run.provider.idempotentSend) {
    return reconcile(db, {
      attempt,
      provider: run.provider,
      signal: run.signal,
      now: run.now,
      windowMs: run.windowMs,
    });
  }
  if (attempt.status === "needs_review" || attempt.status === "failed") {
    return ok({ status: attempt.status });
  }
  const access = await assertAttemptSender(db, attempt.id, run.signal);
  if (!access.ok) return access;
  return deliver(db, attempt, run, null);
}

async function deliver(
  db: Db,
  attempt: AttemptRow,
  run: SendRun,
  claimToken: string | null,
): Promise<Result<SendOutcome, AppError>> {
  const resendStartedAt = claimToken === null ? attempt.send_started_at : null;
  const settle = (outcome: ProviderSendOutcome) =>
    applySendOutcome(db, {
      attemptId: attempt.id,
      outcome,
      resendStartedAt,
      idempotentSend: run.provider.idempotentSend,
      run,
    });

  const inputs = await loadSendInputs(db, attempt.id, run.accountId, run.signal);
  if (inputs === undefined)
    return err(new AppError("E_DB_002", "send inputs not found", { id: attempt.id }));
  run.signal.throwIfAborted();
  const { from, payload, gmailThreadId, parentGmailMessageId } = inputs;

  const limit = checkRecipientLimit(run.provider.kind, payload);
  if (!limit.ok) return settle({ kind: "rejected", error: limit.error });

  const threading = await loadReplyThreadHeaders(
    run.provider,
    parentGmailMessageId,
    gmailThreadId,
    run.signal,
  );

  if (claimToken !== null && !(await stamp(db, attempt.id, claimToken, run.signal))) {
    return err(new AppError("E_GMAIL_008", "stamp race lost", { id: attempt.id }));
  }

  const attResult = await fetchAttachmentBytes(payload, run.storage, run.signal);
  if (!attResult.ok) return attResult;

  const sent = await run.provider.send({
    message: {
      from,
      to: payload.to,
      cc: payload.cc ?? [],
      bcc: payload.bcc ?? [],
      subject: payload.subject,
      html: payload.html,
      text: payload.text ?? null,
      messageIdHeader: attempt.message_id_header,
      inReplyTo: threading.inReplyTo,
      references: threading.references,
      providerThreadId: gmailThreadId,
      attachments: attResult.value,
      attemptId: attempt.id,
    },
    signal: run.signal,
  });
  run.signal.throwIfAborted();
  return settle(sent.ok ? sent.value : outcomeFromSendError(sent.error));
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
