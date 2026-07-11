/**
 * /auth/logout: revokes the current session and clears auth cookies.
 *
 * Security invariants:
 * 1. Loads the live session from the wd_sid cookie; if none exists, still clears
 *    cookies and redirects (idempotent, no 500 on stale requests).
 * 2. Revokes ALL sessions for the user (matches offboarding-revokes-all semantic).
 * 3. Clears both wd_sid and wd_csrf cookies on the redirect response.
 * 4. Infra errors are caught; always redirect to /login (no 500 leak).
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { db } from "@/db/client";
import { CSRF_COOKIE } from "@/features/auth/csrf";
import { logoutCore } from "@/features/auth/logout";
import { SESSION_COOKIE } from "@/features/auth/session";

const CLEARED_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 0,
} as const;

function redirectToLogin(): NextResponse {
  const res = NextResponse.redirect(new URL("/login", env.BASE_URL));
  res.cookies.set(SESSION_COOKIE, "", CLEARED_COOKIE_OPTIONS);
  res.cookies.set(CSRF_COOKIE, "", { ...CLEARED_COOKIE_OPTIONS, httpOnly: false });
  return res;
}

export async function GET(): Promise<NextResponse> {
  const signal = AbortSignal.timeout(10_000);

  try {
    const jar = await cookies();
    const sid = jar.get(SESSION_COOKIE)?.value ?? null;

    await logoutCore({ db, sid, signal });

    return redirectToLogin();
  } catch (e) {
    console.error("[auth/logout] infra error during logout:", e);
    return redirectToLogin();
  }
}

// Support POST as well (form-based logout buttons).
export { GET as POST };
