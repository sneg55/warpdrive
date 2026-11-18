import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { resolveAttachmentDownload } from "@/features/email/attachmentDownload";
import { resolveProvider } from "@/features/email/provider/resolveProvider";
import { createContext } from "@/server/trpc/context";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ attachmentId: string }> },
): Promise<Response> {
  const { attachmentId } = await ctx.params;
  const { actor } = await createContext();
  if (actor === null) return new Response("Unauthorized", { status: 401 });

  const signal = AbortSignal.timeout(30_000);
  const resolveClient = (accountId: string, s: AbortSignal) => resolveProvider(db, accountId, s);

  const r = await resolveAttachmentDownload(db, { resolveClient }, { actor, attachmentId }, signal);
  if (!r.ok) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(r.value.bytes), {
    headers: {
      "content-type": r.value.mimeType,
      "content-disposition": `attachment; filename="${r.value.filename.replace(/"/g, "")}"`,
    },
  });
}
