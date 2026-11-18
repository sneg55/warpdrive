import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { recordOpen } from "@/features/email/tracking";
import { checkRateLimit } from "@/server/rateLimitGuard";

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");

function pixel(): Response {
  return new Response(new Uint8Array(GIF), {
    headers: {
      "content-type": "image/gif",
      "cache-control": "no-store, no-cache, must-revalidate, private",
      pragma: "no-cache",
    },
  });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  const signal = AbortSignal.timeout(5000);
  if (!checkRateLimit("emailTracking", req.headers).allowed) return pixel();
  try {
    const { token } = await ctx.params;
    await recordOpen(db, token, req.headers.get("user-agent"), signal);
  } catch {}
  return pixel();
}
