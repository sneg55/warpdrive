import { createHash } from "node:crypto";

export const GRAVATAR_SIZE = 100;

export function gravatarUrl(email: string): string {
  const normalized = email.trim().toLowerCase();
  const hash = createHash("sha256").update(normalized).digest("hex");
  return `https://gravatar.com/avatar/${hash}?d=identicon&s=${GRAVATAR_SIZE}`;
}
