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
  // The request's own Host header ("host:port"), used to enforce strict same-origin in the dev
  // exception below so it cannot be widened into a cross-port hole.
  host: string | null;
  secFetchSite: string | null;
}

// Outside production the dev server is frequently served on a different port than BASE_URL
// (e.g. :3001 when :3000 is taken by another process), which would make the strict
// Origin === BASE_URL check reject every same-origin server action. We accept a loopback origin
// ONLY when it is strictly same-origin with the request it is hitting: the Origin's host:port must
// equal the request Host header. That keeps dev working on any port while still rejecting a page on
// another local port (e.g. localhost:1234) that shares the host-scoped `wd_csrf` cookie and tries
// to post to this instance. Dead in production (NODE_ENV check); the token + Sec-Fetch-Site checks
// still apply on top.
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

// Double-submit token AND strict Origin/Sec-Fetch-Site validation vs. BASE_URL (ops spec A0).
export function validateCsrf(input: CsrfInput): Result<true, string> {
  const { cookieToken, headerToken, origin, host, secFetchSite } = input;
  if (cookieToken === null || headerToken === null) return err("missing csrf token");
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return err("csrf token mismatch");

  // A null origin (header absent) falls through to the double-submit + Sec-Fetch-Site
  // checks by design; we only reject when an origin is present and does not match.
  const allowedOrigin = new URL(env.BASE_URL).origin;
  if (origin !== null && origin !== allowedOrigin && !isAllowedDevOrigin(origin, host)) {
    return err("origin mismatch");
  }
  if (secFetchSite !== null && secFetchSite !== "same-origin" && secFetchSite !== "same-site") {
    return err("cross-site request rejected");
  }
  return ok(true);
}
