"use server";

import { cookies } from "next/headers";
import { CSRF_COOKIE, mintCsrfToken } from "@/features/auth/csrf";

const CSRF_COOKIE_OPTIONS = {
  httpOnly: false,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 7 * 24 * 60 * 60,
} as const;

export async function ensureCsrfAction(): Promise<void> {
  const jar = await cookies();
  if (jar.get(CSRF_COOKIE) !== undefined) return;
  jar.set(CSRF_COOKIE, mintCsrfToken(), CSRF_COOKIE_OPTIONS);
}
