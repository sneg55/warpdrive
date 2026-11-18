import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/config/env";
import { db } from "@/db/client";
import { CSRF_COOKIE, mintCsrfToken } from "@/features/auth/csrf";
import { devLoginCore } from "@/features/auth/devLogin";
import { SESSION_COOKIE, sessionCookieOptions } from "@/features/auth/session";

const CSRF_COOKIE_OPTIONS = {
  httpOnly: false,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
} as const;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const signal = AbortSignal.timeout(10_000);
  const rawEmail = req.nextUrl.searchParams.get("email");

  const result = await devLoginCore(rawEmail, {
    db,
    appEnv: {
      nodeEnv: env.NODE_ENV,
      allowFirstLoginAdmin: env.ALLOW_FIRST_LOGIN_ADMIN,
      workspaceDomain: env.GOOGLE_WORKSPACE_DOMAIN,
    },
    signal,
  });

  if (!result.ok) {
    return new NextResponse(null, { status: 404 });
  }

  const { sid, expiresAt } = result.value;
  const csrfToken = mintCsrfToken();

  const jar = await cookies();
  jar.set(SESSION_COOKIE, sid, { ...sessionCookieOptions(), expires: expiresAt });
  jar.set(CSRF_COOKIE, csrfToken, { ...CSRF_COOKIE_OPTIONS, expires: expiresAt });

  return NextResponse.redirect(new URL("/", env.BASE_URL));
}
