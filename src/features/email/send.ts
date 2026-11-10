import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { StorageClient } from "@/features/files/storage";
import { err, ok, type Result } from "@/types/result";
import type { GmailClient } from "./gmailClient";
import { assertMailboxOwner } from "./mailboxOwnership";
import { applyMergeFields } from "./merge";
import { buildMergeContext } from "./mergeContext";
import { enqueueSend, processSendAttempt } from "./outbox";
import { sanitizeAuthorHtml } from "./sanitizeHtml";
import { applyTrackingAndSignature, resolveAttachments } from "./sendHelpers";
import { ensureLocalCopyForReplay } from "./sendReplayRepair";
import { enqueueScheduledSendJob, isFutureScheduledSend } from "./sendScheduling";
import { storeOutboundCopy } from "./sendStore";
import { backfillTokens, disableTokens } from "./tracking";

export type { SendEmailInput } from "./sendInput";

export { sendEmailInput } from "./sendInput";
export { sendGmail } from "./sendSystem";

import type { SendEmailInput } from "./sendInput";

export interface SendEmailArgs {
  actorId: string;
  actorType: "admin" | "regular";
  actorGroupIds: ReadonlySet<string>;
  gmail: GmailClient;
  storage: StorageClient;
  input: SendEmailInput;
  signal: AbortSignal;
}

export async function sendEmail(
  db: Db,
  args: SendEmailArgs,
): Promise<Result<{ status: string; messageId?: string }, AppError>> {
  const signal = args.signal;
  try {
    return await runSend(db, args, signal);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    return err(
      new AppError(ERROR_IDS.GMAIL_API_EXHAUSTED, "send orchestration failed", {
        cause: String(e),
      }),
    );
  }
}

async function runSend(
  db: Db,
  args: SendEmailArgs,
  signal: AbortSignal,
): Promise<Result<{ status: string; messageId?: string }, AppError>> {
  const { input } = args;

  const acct = await assertMailboxOwner(db, input.accountId, args.actorId, signal);
  if (!acct.ok) return acct;
  const emailAddress = acct.value.emailAddress;

  const actor = {
    id: args.actorId,
    type: args.actorType,
    isActive: true,
    groupIds: args.actorGroupIds,
  };

  const recipientCount = input.to.length + (input.cc?.length ?? 0) + (input.bcc?.length ?? 0);
  const mergeCtx = await buildMergeContext(
    db,
    {
      owner: actor,
      recipientEmail: recipientCount === 1 ? (input.to[0] ?? "") : "",
      explicitPersonId: input.linkPersonId ?? null,
      explicitDealId: input.linkDealId ?? null,
    },
    signal,
  );
  const mergedSubject = applyMergeFields(input.subject, mergeCtx);
  const sanitizedBody = sanitizeAuthorHtml(applyMergeFields(input.bodyHtml, mergeCtx));

  const resolvedTrackOpens = input.trackOpens ?? input.trackingEnabled ?? false;
  const resolvedTrackLinks = input.trackLinks ?? input.trackingEnabled ?? false;

  const attResult = await resolveAttachments(db, actor, input.attachments ?? [], signal);
  if (!attResult.ok) return attResult;
  const resolvedAttachments = attResult.value;

  const enq = await enqueueSend(
    db,
    {
      accountId: input.accountId,
      idempotencyKey: input.idempotencyKey,
      payload: {
        actorId: args.actorId,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        subject: mergedSubject,
        html: sanitizedBody,
        trackOpens: resolvedTrackOpens,
        trackLinks: resolvedTrackLinks,
        attachments: resolvedAttachments.length > 0 ? resolvedAttachments : undefined,
        linkPersonId: input.linkPersonId ?? null,
        linkDealId: input.linkDealId ?? null,
        visibility: input.visibility ?? null,
      },
      threadId: input.threadId ?? null,
      scheduledAt: input.scheduledSendAt ?? null,
    },
    signal,
  );
  if (!enq.ok) return enq;
  const attemptId = enq.value.attemptId;

  if (enq.value.replay) {
    const repaired = await ensureLocalCopyForReplay(db, {
      attemptId,
      accountId: input.accountId,
      fromEmail: emailAddress,
      gmail: args.gmail,
      signal,
    });
    if (!repaired.ok) return repaired;
    return ok({ status: "sent", messageId: repaired.value.messageId });
  }

  const bodyResult = await applyTrackingAndSignature(db, {
    attemptId,
    actorId: args.actorId,
    sanitizedBody,
    signatureId: input.signatureId,
    trackOpens: resolvedTrackOpens,
    trackLinks: resolvedTrackLinks,
    recipient: input.to[0] ?? "",
    signal,
  });
  if (!bodyResult.ok) return bodyResult;
  const bodyForCopy = bodyResult.value;

  if (isFutureScheduledSend(input.scheduledSendAt, Date.now())) {
    await enqueueScheduledSendJob(
      input.accountId,
      input.idempotencyKey,
      input.scheduledSendAt,
      signal,
    );
    return ok({ status: "scheduled" });
  }

  const outcome = await processSendAttempt(db, {
    accountId: input.accountId,
    idempotencyKey: input.idempotencyKey,
    gmail: args.gmail,
    storage: args.storage,
    signal,
  });
  if (!outcome.ok) return outcome;

  if (outcome.value.status === "sent" && outcome.value.gmailMessageId !== undefined) {
    const stored = await storeOutboundCopy(db, {
      sentByUserId: args.actorId,
      accountId: input.accountId,
      fromEmail: emailAddress,
      gmailMessageId: outcome.value.gmailMessageId,
      input: { ...input, subject: mergedSubject },
      resolvedTrackingEnabled: resolvedTrackOpens || resolvedTrackLinks,
      bodyHtml: bodyForCopy,
      visibility: input.visibility,
      gmail: args.gmail,
      link: {
        owner: actor,
        recipients: [...input.to, ...(input.cc ?? []), ...(input.bcc ?? [])],
        explicitPersonId: input.linkPersonId ?? null,
        explicitDealId: input.linkDealId ?? null,
      },
      signal,
    });
    if (!stored.ok) return stored;
    await backfillTokens(db, {
      sendAttemptId: attemptId,
      messageId: stored.value.messageId,
      signal,
    });
    return ok({ status: "sent", messageId: outcome.value.gmailMessageId });
  }

  await disableTokens(db, attemptId, signal);
  return ok({ status: outcome.value.status, messageId: outcome.value.gmailMessageId });
}
