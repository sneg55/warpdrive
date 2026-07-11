import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { checkHealth } from "@/features/health/healthCheck";

// Needs the pg pool (node runtime) and must never be cached: a stale 200 would
// defeat the container healthcheck that drives restarts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const result = await checkHealth(db, AbortSignal.timeout(5_000));
  if (!result.ok) {
    // This endpoint is reachable through the public proxy, so the body stays opaque
    // (no internal error string); the detail is logged for the operator instead.
    console.error(`health check failed: ${result.error}`);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
