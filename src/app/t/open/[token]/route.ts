/**
 * /t/open/[token]: public tracking pixel.
 *
 * Records the open best-effort, then ALWAYS returns a 1x1 transparent GIF. Fail-open:
 * an unknown or disabled token still returns the pixel (never 500, never break email
 * rendering). A disabled token records no event but still serves the pixel.
 */

import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { recordOpen } from "@/features/email/tracking";

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
  try {
    const { token } = await ctx.params;
    await recordOpen(db, token, req.headers.get("user-agent"), signal);
  } catch {
    // Fail-open: never let a tracking failure break email rendering.
  }
  return pixel();
}
