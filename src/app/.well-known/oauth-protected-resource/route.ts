import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { buildProtectedResourceMetadata } from "@/features/oauth/metadata";

export function GET(): Response {
  if (!env.MCP_ENABLED) return new NextResponse("Not found", { status: 404 });
  return NextResponse.json(buildProtectedResourceMetadata(env.BASE_URL));
}
