import { z } from "zod";
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

export type { SystemMessage, SystemSendDeps } from "./sendSystem";
// The lower-level system-send primitive lives in its own file (send.ts is at the size
// cap) but is re-exported here so callers import both sends from one module.
export { sendGmail } from "./sendSystem";

// Boundary validation for the interactive send action. idempotencyKey is a strict UUID
// so a client cannot smuggle a forged Message-ID seed (it feeds deriveMessageId).
export const sendEmailInput = z.object({
  accountId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string(),
  bodyHtml: z.string(),
  threadId: z.string().optional(),
  inReplyToGmailMessageId: z.string().optional(),
  // Back-compat: trackingEnabled maps to both trackOpens and trackLinks.
  trackingEnabled: z.boolean().optional(),
  trackOpens: z.boolean().optional(),
  trackLinks: z.boolean().optional(),
  // signatureId: server appends the signature body_html to bodyHtml on send.
  // The signature must belong to the actor; ownership is enforced server-side.
  signatureId: z.string().uuid().optional(),
  // attachments: fileIds (already confirmed via files upload handshake) to embed
  // as MIME parts. Each file must be readable by the actor; a denied file fails the
  // entire send with E_GMAIL_012 so no partial attachment leaks.
  attachments: z.array(z.object({ fileId: z.string().uuid() })).optional(),
  // scheduledSendAt: when set to a future time, the attempt is stored with
  // scheduled_at set and no Gmail call is made. The worker promotes the row
  // when it becomes due via the normal processSendAttempt path.
  scheduledSendAt: z.date().optional(),
  // linkPersonId / linkDealId: optional CRM link context from the composer (e.g. the deal
  // workspace passes its deal + primary contact) so a NEW outbound thread links to them.
  // Re-verified for visibility server-side (never trusted as a raw client FK). Omitted for a
  // plain inbox compose, which falls back to recipient-based auto-linking.
  linkPersonId: z.string().uuid().optional(),
  linkDealId: z.string().uuid().optional(),
});

export type SendEmailInput = z.infer<typeof sendEmailInput>;

export interface SendEmailArgs {
  actorId: string;
  // actorType and actorGroupIds carry the real permission shape for attachment authz.
  // Callers obtain these from the trusted session context (never from client input).
  actorType: "admin" | "regular";
  actorGroupIds: ReadonlySet<string>;
  gmail: GmailClient;
  // storage is required: every send path must wire in real storage so production
  // attachment sends never silently fail. Tests inject FakeStorageClient.
  storage: StorageClient;
  input: SendEmailInput;
  signal?: AbortSignal;
}

// INTERACTIVE, user-facing send: ownership check, durable outbox/idempotency, tracking
// tokens, and the stored CRM copy. (The lower-level system-send primitive is a separate
// export added in Task 15.) gmail is injected so tests can supply the fake.
export async function sendEmail(
  db: Db,
  args: SendEmailArgs,
): Promise<Result<{ status: string; messageId?: string }, AppError>> {
  const signal = args.signal ?? AbortSignal.timeout(8000);
  // Localized boundary: the tracking-path DB calls (mint/persist/backfill/disable) and
  // the outbox throw on DB failure. Turn any unexpected throw into a Result so the
  // server action surface stays Result-clean (never an unhandled 500). An AbortError
  // is a cancellation, not an operational failure, so it propagates unswallowed.
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

  // (a) Ownership: load the account via assertMailboxOwner helper. Missing OR not-owned
  // are treated identically so a caller cannot probe which account ids exist.
  const acct = await assertMailboxOwner(db, input.accountId, args.actorId, signal);
  if (!acct.ok) return acct;
  const emailAddress = acct.value.emailAddress;

  const actor = {
    id: args.actorId,
    type: args.actorType,
    isActive: true,
    groupIds: args.actorGroupIds,
  };

  // (b) Merge fields, THEN sanitize. Template tokens ({{person.name}}, {{deal.title}}, ...) are
  // resolved from the recipient's contact + linked deal/org (visibility-scoped) so recipients
  // never receive a raw {{token}}. Merging before sanitize means any HTML in a resolved value is
  // sanitized like the rest of the body. Unknown tokens render as "" (applyMergeFields).
  // ONE body is delivered to every To/Cc/Bcc recipient, so a recipient-derived {{person.*}} token
  // would leak the first recipient's contact data to everyone else. Only resolve the recipient-based
  // person when there is exactly one recipient; multi-recipient sends keep only the sender's explicit
  // deal/person context (chosen deliberately in the composer), and unresolved person tokens blank out.
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

  // Back-compat: trackingEnabled maps to both trackOpens and trackLinks.
  const resolvedTrackOpens = input.trackOpens ?? input.trackingEnabled ?? false;
  const resolvedTrackLinks = input.trackLinks ?? input.trackingEnabled ?? false;

  // (c) Resolve attachments: authorize each fileId against the actor and load its
  // metadata. Do this BEFORE enqueueing so a denied file fails fast with no DB row.
  const attResult = await resolveAttachments(db, actor, input.attachments ?? [], signal);
  if (!attResult.ok) return attResult;
  const resolvedAttachments = attResult.value;

  // (d) Enqueue first (idempotent). A replay of an already-sent attempt short-circuits:
  // never re-mint or re-send.
  const enq = await enqueueSend(db, {
    accountId: input.accountId,
    idempotencyKey: input.idempotencyKey,
    payload: {
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: mergedSubject,
      html: sanitizedBody,
      trackOpens: resolvedTrackOpens,
      trackLinks: resolvedTrackLinks,
      attachments: resolvedAttachments.length > 0 ? resolvedAttachments : undefined,
    },
    threadId: input.threadId ?? null,
    scheduledAt: input.scheduledSendAt ?? null,
  });
  if (!enq.ok) return enq;
  const attemptId = enq.value.attemptId;

  if (enq.value.replay) {
    // Never blindly report success: repair the local copy if a prior send was accepted by
    // Gmail but its local-copy/token step failed or crashed (F17). Idempotent, no re-send.
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

  // (e) Apply tracking rewrites and append signature (extracted to sendHelpers.ts).
  // This runs for BOTH immediate and scheduled sends: the helper persists the prepared
  // body into the payload row (jsonb_set), so a "Send later" email carries the same
  // signature and tracking rewrites an immediate send would. Runs BEFORE the scheduled
  // early-return so the worker later sends the already-prepared payload unchanged.
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

  // (d2) Scheduled send: if scheduledSendAt is in the future, return now (after body prep
  // above). Enqueue a delayed pg-boss job so the worker fires processSendAttempt (which
  // also does the CRM copy + token backfill via runSendJob) when the row becomes due.
  // enqueueScheduledSendJob is a no-op when no boss is set (tests, web at boot), so
  // DB-only tests stay free of a live queue.
  if (isFutureScheduledSend(input.scheduledSendAt, Date.now())) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await enqueueScheduledSendJob(input.accountId, input.idempotencyKey, input.scheduledSendAt!);
    return ok({ status: "scheduled" });
  }

  // (f) Process the outbox attempt (claim, stamp, send or reconcile).
  const outcome = await processSendAttempt(db, {
    accountId: input.accountId,
    idempotencyKey: input.idempotencyKey,
    gmail: args.gmail,
    storage: args.storage,
    signal,
  });
  if (!outcome.ok) return outcome;

  // (g) On success store the CRM copy and backfill tokens; otherwise disable tokens.
  if (outcome.value.status === "sent" && outcome.value.gmailMessageId !== undefined) {
    const stored = await storeOutboundCopy(db, {
      accountId: input.accountId,
      fromEmail: emailAddress,
      gmailMessageId: outcome.value.gmailMessageId,
      // Store the CRM copy under the MERGED subject so the thread/message match what was sent.
      input: { ...input, subject: mergedSubject },
      resolvedTrackingEnabled: resolvedTrackOpens || resolvedTrackLinks,
      bodyHtml: bodyForCopy,
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
