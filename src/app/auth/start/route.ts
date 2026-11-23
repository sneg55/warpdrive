import { type NextRequest, NextResponse } from "next/server";

export function GET(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = "/auth/start/google";
  return NextResponse.redirect(url, 308);
}
