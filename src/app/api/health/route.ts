import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { checkHealth } from "@/features/health/healthCheck";
import { checkRateLimit, tooManyRequestsResponse } from "@/server/rateLimitGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const limit = checkRateLimit("health", req.headers);
  if (!limit.allowed) return tooManyRequestsResponse(limit);

  const result = await checkHealth(db, AbortSignal.timeout(5_000));
  if (!result.ok) {
    console.error(`health check failed: ${result.error}`);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
