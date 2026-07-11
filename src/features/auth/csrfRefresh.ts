"use server";

import { cookies } from "next/headers";
import { CSRF_COOKIE, mintCsrfToken } from "@/features/auth/csrf";

const CSRF_COOKIE_OPTIONS = {
  httpOnly: false, // must be JS-readable for double-submit
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 7 * 24 * 60 * 60, // 7 days, matches session TTL
} as const;

// Sets the wd_csrf cookie if not already present.
// Called from CsrfRefresher client component when the cookie is absent.
export async function ensureCsrfAction(): Promise<void> {
  const jar = await cookies();
  if (jar.get(CSRF_COOKIE) !== undefined) return;
  jar.set(CSRF_COOKIE, mintCsrfToken(), CSRF_COOKIE_OPTIONS);
}
