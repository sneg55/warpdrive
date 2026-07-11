/**
 * /api/users/[userId]/avatar: inline avatar serving.
 *
 * avatar_url points here (with a ?v=uploadId cache-buster). Unlike file attachments, avatars
 * are served inline with a stable URL so an <img> can render them on every page, and they are
 * visible to any authenticated user (owner badges appear app-wide), so there is no per-viewer
 * visibility check, only an authenticated-actor gate. Byte fetch + validation is delegated to
 * resolveAvatarBytes, which is unit tested with a fake storage client. A missing object returns
 * 404 so the Avatar component falls back to colored initials.
 */

import type { NextRequest } from "next/server";
import { makeStorageClient } from "@/features/files/storage";
import { resolveAvatarBytes } from "@/features/identity/avatar/avatarServe";
import { createContext } from "@/server/trpc/context";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ userId: string }> },
): Promise<Response> {
  const { userId } = await ctx.params;
  const { actor } = await createContext();
  if (actor === null) return new Response("Unauthorized", { status: 401 });

  const signal = AbortSignal.timeout(10_000);
  const r = await resolveAvatarBytes(makeStorageClient(), userId, signal);
  if (!r.ok) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(r.value.bytes), {
    headers: {
      "content-type": r.value.contentType,
      // Private (per-user session) + immutable: the ?v version changes on every upload, so a
      // long cache is safe and a replaced avatar is never served stale.
      "cache-control": "private, max-age=86400, immutable",
    },
  });
}
