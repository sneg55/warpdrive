"use server";

import { cookies, headers } from "next/headers";
import { CSRF_COOKIE, validateCsrf } from "@/features/auth/csrf";
import type { PermSetUser } from "@/features/permissions/effective";
import { err, type Result } from "@/types/result";

// Unit-testable core: enforce actor presence, then run the body.
export async function runWithActor<T>(
  actor: PermSetUser | null,
  body: (actor: PermSetUser) => Promise<Result<T, string>>,
): Promise<Result<T, string>> {
  if (actor === null) return err("unauthorized");
  return body(actor);
}

// Every mutating action must call this before any write (CSRF enforcement point, ops A0).
export async function guardCsrf(headerToken: string | null): Promise<Result<true, string>> {
  const h = await headers();
  const c = await cookies();
  return validateCsrf({
    cookieToken: c.get(CSRF_COOKIE)?.value ?? null,
    headerToken,
    origin: h.get("origin"),
    host: h.get("host"),
    secFetchSite: h.get("sec-fetch-site"),
  });
}
