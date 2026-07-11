/**
 * /api/email/attachments/[attachmentId]: lazy inbound-attachment download.
 *
 * Bytes are never stored in Postgres (email_message_attachments holds metadata only,
 * see Task 4). This route is a thin wrapper: it resolves the signed-in actor, builds a
 * real Gmail client resolver (same ensureAccessToken + makeRefresh dependency the worker
 * uses), and delegates the authz-gated fetch to resolveAttachmentDownload, which is unit
 * tested with a fake Gmail client. A denied or missing attachment returns 404 (never a
 * 403, so existence of a private thread's attachment is never leaked).
 */

import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { resolveAttachmentDownload } from "@/features/email/attachmentDownload";
import { createGmailClient } from "@/features/email/gmailClient";
import { makeRefresh } from "@/features/email/gmailRefresh";
import { ensureAccessToken } from "@/features/email/tokens";
import { createContext } from "@/server/trpc/context";
import { ok } from "@/types/result";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ attachmentId: string }> },
): Promise<Response> {
  const { attachmentId } = await ctx.params;
  const { actor } = await createContext();
  if (actor === null) return new Response("Unauthorized", { status: 401 });

  const signal = AbortSignal.timeout(30_000);
  const resolveClient = async (accountId: string, s: AbortSignal) => {
    const token = await ensureAccessToken(db, { accountId, deps: { refresh: makeRefresh(s) } });
    if (!token.ok) return token;
    return ok(createGmailClient(token.value.token));
  };

  const r = await resolveAttachmentDownload(db, { resolveClient }, { actor, attachmentId }, signal);
  if (!r.ok) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(r.value.bytes), {
    headers: {
      "content-type": r.value.mimeType,
      "content-disposition": `attachment; filename="${r.value.filename.replace(/"/g, "")}"`,
    },
  });
}
