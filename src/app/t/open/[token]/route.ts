/**
 * /t/open/[token]: public tracking pixel.
 *
 * Records the open best-effort, then ALWAYS returns a 1x1 transparent GIF. Fail-open:
 * an unknown or disabled token still returns the pixel (never 500, never break email
 * rendering). A disabled token records no event but still serves the pixel.
 *
 * RATE LIMITING: over the limit, this skips the RECORDING and still serves the pixel. It never
 * returns 429. The endpoint is unauthenticated and every hit costs a join plus a transaction,
 * an insert, a NOTIFY and a notification write, which is what makes it worth flooding; the
 * pixel itself is 43 bytes of constant. So the expensive half is what gets shed, and a mail
 * client rendering a real email is never shown a broken image because someone else was abusive.
 */

import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { recordOpen } from "@/features/email/tracking";
import { checkRateLimit } from "@/server/rateLimitGuard";

// 1x1 transparent GIF.
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
  } catch {
    // Fail-open: never let a tracking failure break email rendering.
  }
  return pixel();
}
