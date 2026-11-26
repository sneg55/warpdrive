import { createHash } from "node:crypto";

export const GRAVATAR_SIZE = 100;

const GRAVATAR_AVATAR_PREFIX = "https://gravatar.com/avatar/";

export function gravatarUrl(email: string): string {
  const normalized = email.trim().toLowerCase();
  const hash = createHash("sha256").update(normalized).digest("hex");
  return `${GRAVATAR_AVATAR_PREFIX}${hash}?d=identicon&s=${GRAVATAR_SIZE}`;
}

export function isGravatarUrl(url: string | null): boolean {
  return url?.startsWith(GRAVATAR_AVATAR_PREFIX) ?? false;
}
