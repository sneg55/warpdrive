import { eq, sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { files } from "@/db/schema";
import { canActorAccessParent } from "@/features/files/fileAuthz";
import type { AuthUser } from "@/features/permissions/types";
import { err, ok, type Result } from "@/types/result";
import { assertSignatureOwner } from "./mailboxOwnership";
import { sanitizeAuthorHtml } from "./sanitizeHtml";
import { mintTokensForSend, rewriteBody } from "./tracking";

export interface ResolvedAttachment {
  fileId: string;
  s3Key: string;
  contentType: string;
  filename: string;
}

function extractLinks(html: string): string[] {
  const links: string[] = [];
  const re = /href=["']([^"']+)["']/g;
  let m: RegExpExecArray | null = re.exec(html);
  while (m !== null) {
    const href = m[1];
    if (href !== undefined) links.push(href);
    m = re.exec(html);
  }
  return links;
}

export async function applyTrackingAndSignature(
  db: Db,
  args: {
    attemptId: string;
    actorId: string;
    sanitizedBody: string;
    signatureId: string | undefined;
    trackOpens: boolean;
    trackLinks: boolean;
    recipient: string;
    signal: AbortSignal;
  },
): Promise<Result<string, AppError>> {
  const { signal } = args;
  let body = args.sanitizedBody;

  if (args.trackOpens || args.trackLinks) {
    const minted = await mintTokensForSend(db, {
      sendAttemptId: args.attemptId,
      recipient: args.recipient,
      links: extractLinks(args.sanitizedBody),
      trackOpens: args.trackOpens,
      trackLinks: args.trackLinks,
      signal,
    });
    body = rewriteBody({
      html: args.sanitizedBody,
      openToken: minted.openToken,
      linkTokens: minted.linkTokens,
    });
    await db.execute(sql`
      UPDATE email_send_attempts
      SET payload = jsonb_set(payload, '{html}', ${JSON.stringify(body)}::jsonb)
      WHERE id=${args.attemptId}
    `);
    signal.throwIfAborted();
  }

  if (args.signatureId !== undefined) {
    const sig = await assertSignatureOwner(db, args.signatureId, args.actorId, signal);
    if (!sig.ok) return sig;
    body = body + sanitizeAuthorHtml(sig.value.bodyHtml);
    await db.execute(sql`
      UPDATE email_send_attempts
      SET payload = jsonb_set(payload, '{html}', ${JSON.stringify(body)}::jsonb)
      WHERE id=${args.attemptId}
    `);
    signal.throwIfAborted();
  }

  return ok(body);
}

export async function resolveAttachments(
  db: Db,
  actor: AuthUser,
  attachments: Array<{ fileId: string }>,
  signal: AbortSignal,
): Promise<Result<ResolvedAttachment[], AppError>> {
  const resolved: ResolvedAttachment[] = [];
  for (const att of attachments) {
    const [row] = await db.select().from(files).where(eq(files.id, att.fileId));
    signal.throwIfAborted();
    if (row === undefined || row.status !== "ready") {
      return err(
        new AppError(ERROR_IDS.GMAIL_ATTACHMENT_DENIED, "attachment not found or not accessible", {
          fileId: att.fileId,
        }),
      );
    }
    const allowed = await canActorAccessParent(db, actor, row.entityType, row.entityId, signal);
    signal.throwIfAborted();
    if (!allowed) {
      return err(
        new AppError(ERROR_IDS.GMAIL_ATTACHMENT_DENIED, "attachment not found or not accessible", {
          fileId: att.fileId,
        }),
      );
    }
    resolved.push({
      fileId: att.fileId,
      s3Key: row.s3Key,
      contentType: row.contentType,
      filename: row.filename,
    });
  }
  return ok(resolved);
}
