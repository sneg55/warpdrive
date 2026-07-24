import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { buildAuthServerMetadata } from "@/features/oauth/metadata";

export function GET(): Response {
  if (!env.MCP_ENABLED) return new NextResponse("Not found", { status: 404 });
  return NextResponse.json(
    buildAuthServerMetadata(env.BASE_URL, { registration: env.OAUTH_REGISTRATION }),
  );
}
