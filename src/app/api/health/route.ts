import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { checkHealth } from "@/features/health/healthCheck";
import { checkRateLimit, tooManyRequestsResponse } from "@/server/rateLimitGuard";

// Needs the pg pool (node runtime) and must never be cached: a stale 200 would
// defeat the container healthcheck that drives restarts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  // Unauthenticated and runs a query per hit. The container healthcheck polls every 15s from
  // inside the network, where there is no X-Forwarded-For, so it lands in the shared "unknown"
  // bucket and cannot be starved by external traffic, which always arrives through Caddy with
  // a forwarded-for entry.
  const limit = checkRateLimit("health", req.headers);
  if (!limit.allowed) return tooManyRequestsResponse(limit);

  const result = await checkHealth(db, AbortSignal.timeout(5_000));
  if (!result.ok) {
    // This endpoint is reachable through the public proxy, so the body stays opaque
    // (no internal error string); the detail is logged for the operator instead.
    console.error(`health check failed: ${result.error}`);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
