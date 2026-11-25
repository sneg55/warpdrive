import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/config/env";

export function GET(req: NextRequest): NextResponse {
  const url = new URL("/auth/callback/google", env.BASE_URL);
  url.search = req.nextUrl.search;
  return NextResponse.redirect(url, 308);
}
