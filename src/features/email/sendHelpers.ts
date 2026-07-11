// Helpers extracted from send.ts to keep that file within the 300-line / complexity limits.
// These are internal to the email feature; not part of the public API surface.

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

// Resolved attachment metadata stored in the outbox payload so replay can rebuild MIME.
export interface ResolvedAttachment {
  fileId: string;
  s3Key: string;
  contentType: string;
  filename: string;
}

// Pull http(s) link hrefs out of authored html so tracking can tokenize them. The
// tracking layer re-validates each scheme; this is just a coarse extractor.
export function extractLinks(html: string): string[] {
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

// Apply tracking token rewrites (Phase 2) then append the sanitised signature (Phase 4).
// Returns the final body string for MIME build and CRM copy storage.
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

// Authorize each fileId against the actor and return its storage metadata.
// Returns E_GMAIL_012 for any file that is missing, not ready, or not readable by
// the actor. Missing and inaccessible cases share the same message (no existence leak).
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
