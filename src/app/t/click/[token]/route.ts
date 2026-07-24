/**
 * /t/click/[token]: public click-tracking redirect.
 *
 * OPEN-REDIRECT INVARIANT: the redirect destination is read ONLY from the STORED
 * token row (target_url captured and validated http(s)-only at mint time), NEVER from
 * the request/query/path. The path param is just the opaque lookup key. An unknown
 * token or a missing target returns a safe in-app fallback, never an attacker URL.
 *
 * RATE LIMITING: over the limit, this still resolves and redirects; only the RECORDING is
 * dropped. Returning 429 was not an option, because a real recipient clicking a real link has
 * to reach the real destination no matter who else is hammering the endpoint. The cheap lookup
 * is what makes the redirect correct, so it stays; the transaction, insert, NOTIFY and
 * notification write are what make this worth flooding, so those are what get shed.
 */

import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/config/env";
import { db } from "@/db/client";
import { recordClick, resolveClickTarget } from "@/features/email/tracking";
import { checkRateLimit } from "@/server/rateLimitGuard";

const SAFE_FALLBACK = `${env.BASE_URL}/inbox`;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  const signal = AbortSignal.timeout(5000);
  const recording = checkRateLimit("emailTracking", req.headers).allowed;
  let target: string | null = null;
  try {
    const { token } = await ctx.params;
    target = recording
      ? await recordClick(db, token, req.headers.get("user-agent"), signal)
      : await resolveClickTarget(db, token, signal);
  } catch {
    // Best-effort: fall through to the safe fallback on any failure.
  }
  // target is the server-stored, http(s)-validated url; null falls back in-app.
  return NextResponse.redirect(target ?? SAFE_FALLBACK);
}
