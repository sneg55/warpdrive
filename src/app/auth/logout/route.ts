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

export { GET as POST };
