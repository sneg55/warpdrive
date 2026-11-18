const CSRF_COOKIE_NAME = "wd_csrf";

export function readCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((part) => part.startsWith(`${CSRF_COOKIE_NAME}=`));
  if (match === undefined) return null;
  return match.split("=")[1] ?? null;
}
