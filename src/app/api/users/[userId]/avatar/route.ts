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
      "cache-control": "private, max-age=86400, immutable",
    },
  });
}
