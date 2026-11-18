import { randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/config/env";
import { err, ok, type Result } from "@/types/result";

export const CSRF_COOKIE = "wd_csrf";

export function mintCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

interface CsrfInput {
  cookieToken: string | null;
  headerToken: string | null;
  origin: string | null;
  host: string | null;
  secFetchSite: string | null;
}

function isAllowedDevOrigin(origin: string, host: string | null): boolean {
  if (env.NODE_ENV === "production") return false;
  if (host === null) return false;
  try {
    const url = new URL(origin);
    const isLoopback =
      url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    return isLoopback && url.host === host;
  } catch {
    return false;
  }
}

export function validateCsrf(input: CsrfInput): Result<true, string> {
  const { cookieToken, headerToken, origin, host, secFetchSite } = input;
  if (cookieToken === null || headerToken === null) return err("missing csrf token");
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return err("csrf token mismatch");

  const allowedOrigin = new URL(env.BASE_URL).origin;
  if (origin !== null && origin !== allowedOrigin && !isAllowedDevOrigin(origin, host)) {
    return err("origin mismatch");
  }
  if (secFetchSite !== null && secFetchSite !== "same-origin" && secFetchSite !== "same-site") {
    return err("cross-site request rejected");
  }
  return ok(true);
}
