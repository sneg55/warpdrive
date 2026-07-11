import { eq } from "drizzle-orm";
import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { emailMessageAttachments, emailMessages, emailThreads } from "@/db/schema";
import type { AuthUser } from "@/features/permissions/types";
import { err, ok, type Result } from "@/types/result";
import { canSeeEmail } from "./emailVisibility";
import type { GmailClient } from "./gmailClient";

export interface AttachmentDownloadDeps {
  resolveClient: (accountId: string, signal: AbortSignal) => Promise<Result<GmailClient, AppError>>;
}

export interface AttachmentDownload {
  filename: string;
  mimeType: string;
  bytes: Buffer;
}

const attachmentIdSchema = z.string().uuid();

// 404-on-invisible, same discipline as canSeeEmail's other callers: a denied actor and a
// missing/unknown attachment id return the identical error so existence is never leaked.
function denied(): AppError {
  return new AppError(ERROR_IDS.GMAIL_ATTACHMENT_DENIED, "attachment not found", {});
}

// Resolve an inbound attachment for download: gate on the parent thread's visibility
// (mailbox-privacy rule, same as getThread/markThreadRead), then lazily fetch the bytes
// from Gmail through the injected client (never a live client baked into this pure logic,
// so it stays testable with a fake). Bytes are never persisted; each download re-fetches.
export async function resolveAttachmentDownload(
  db: Db,
  deps: AttachmentDownloadDeps,
  args: { actor: AuthUser; attachmentId: string },
  signal: AbortSignal,
): Promise<Result<AttachmentDownload, AppError>> {
  signal.throwIfAborted();

  const parsedId = attachmentIdSchema.safeParse(args.attachmentId);
  if (!parsedId.success) {
    return err(
      new AppError(ERROR_IDS.GMAIL_ATTACHMENT_INPUT_INVALID, "attachmentId must be a uuid", {}),
    );
  }

  const rows = await db
    .select({
      filename: emailMessageAttachments.filename,
      mimeType: emailMessageAttachments.mimeType,
      gmailAttachmentId: emailMessageAttachments.gmailAttachmentId,
      gmailMessageId: emailMessages.gmailMessageId,
      accountId: emailThreads.accountId,
      visibility: emailThreads.visibility,
      dealId: emailThreads.dealId,
      personId: emailThreads.personId,
    })
    .from(emailMessageAttachments)
    .innerJoin(emailMessages, eq(emailMessages.id, emailMessageAttachments.messageId))
    .innerJoin(emailThreads, eq(emailThreads.id, emailMessages.threadId))
    .where(eq(emailMessageAttachments.id, parsedId.data));
  signal.throwIfAborted();

  const row = rows[0];
  if (row === undefined) return err(denied());

  const visible = await canSeeEmail(
    db,
    args.actor,
    {
      accountId: row.accountId,
      visibility: row.visibility,
      dealId: row.dealId,
      personId: row.personId,
    },
    signal,
  );
  if (!visible) return err(denied());

  const client = await deps.resolveClient(row.accountId, signal);
  if (!client.ok) return client;

  const data = await client.value.getAttachment({
    messageId: row.gmailMessageId,
    attachmentId: row.gmailAttachmentId,
    signal,
  });
  if (!data.ok) return data;

  return ok({
    filename: row.filename,
    mimeType: row.mimeType,
    bytes: Buffer.from(data.value.dataBase64, "base64url"),
  });
}
