import type { SigninProviders } from "./enabledProviders";
import { safeLoginReturnPath } from "./loginReturn";

const DEFAULT_RETURN_PATH = "/";

export const GOOGLE_START_PATH = "/auth/start/google";
export const OIDC_START_PATH = "/auth/start/oidc";
export const LOGIN_PATH = "/login";

export function withReturnPath(path: string, next: string | null | undefined): string {
  const returnPath = safeLoginReturnPath(next);
  if (returnPath === DEFAULT_RETURN_PATH) return path;
  return `${path}?next=${encodeURIComponent(returnPath)}`;
}

export function signinEntryPath(providers: SigninProviders, next: string): string {
  if (providers.google && !providers.oidc) return withReturnPath(GOOGLE_START_PATH, next);
  if (providers.oidc && !providers.google) return withReturnPath(OIDC_START_PATH, next);
  return withReturnPath(LOGIN_PATH, next);
}
