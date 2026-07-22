export const LOGIN_RETURN_COOKIE = "wd_login_return";

const DEFAULT_RETURN_PATH = "/";
const MAX_RETURN_PATH_LENGTH = 4_096;

export function safeLoginReturnPath(raw: string | null | undefined): string {
  if (
    raw === null ||
    raw === undefined ||
    raw.length === 0 ||
    raw.length > MAX_RETURN_PATH_LENGTH ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("\\")
  ) {
    return DEFAULT_RETURN_PATH;
  }

  const parsed = new URL(raw, "https://warpdrive.invalid");
  return `${parsed.pathname}${parsed.search}`;
}
