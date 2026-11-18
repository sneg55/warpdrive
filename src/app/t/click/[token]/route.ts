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
  } catch {}
  return NextResponse.redirect(target ?? SAFE_FALLBACK);
}
