/**
 * /auth/dev-login: strictly-dev-only synthetic login route.
 *
 * Security invariants:
 * 1. Returns HTTP 404 unless env.NODE_ENV !== "production" AND ALLOW_FIRST_LOGIN_ADMIN is true.
 *    The env.ts boundary already rejects ALLOW_FIRST_LOGIN_ADMIN=true in production,
 *    so this flag cannot be set in a production build.
 * 2. Never disclosed in production: 404 (not 403) to avoid existence leakage.
 * 3. Uses the SAME upsertUserOnLogin + createSession path as the real OAuth callback.
 */

import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/config/env";
import { db } from "@/db/client";
import { CSRF_COOKIE, mintCsrfToken } from "@/features/auth/csrf";
import { devLoginCore } from "@/features/auth/devLogin";
import { SESSION_COOKIE, sessionCookieOptions } from "@/features/auth/session";

const CSRF_COOKIE_OPTIONS = {
  httpOnly: false, // must be readable by JS for double-submit
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
    // Guard fired (disabled) or bad input: return 404 regardless of reason
    // to avoid disclosing route existence in production.
    return new NextResponse(null, { status: 404 });
  }

  const { sid, expiresAt } = result.value;
  const csrfToken = mintCsrfToken();

  const jar = await cookies();
  jar.set(SESSION_COOKIE, sid, { ...sessionCookieOptions(), expires: expiresAt });
  jar.set(CSRF_COOKIE, csrfToken, { ...CSRF_COOKIE_OPTIONS, expires: expiresAt });

  return NextResponse.redirect(new URL("/", env.BASE_URL));
}
