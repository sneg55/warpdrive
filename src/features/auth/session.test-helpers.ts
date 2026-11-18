import { randomBytes } from "node:crypto";

export function sessionFixture(args: { userId: string; expiresAt: Date }) {
  return { ...args, tokenHash: randomBytes(32).toString("base64url") };
}
