// Client-side cookie reader for the wd_csrf double-submit token.
// We cannot import from @/features/auth/csrf here because that module
// transitively pulls in node:fs (via env.ts). The cookie name is duplicated
// intentionally to keep this module browser-safe.
const CSRF_COOKIE_NAME = "wd_csrf";

// Reads the wd_csrf double-submit token from document.cookie.
// Returns null if not found (cookie absent or called server-side).
export function readCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((part) => part.startsWith(`${CSRF_COOKIE_NAME}=`));
  if (match === undefined) return null;
  return match.split("=")[1] ?? null;
}
