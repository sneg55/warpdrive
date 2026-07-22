import { createHash, timingSafeEqual } from "node:crypto";

export function sha256Base64Url(input: string): string {
  return createHash("sha256").update(input).digest("base64url");
}

export function verifyPkceS256(verifier: string, challenge: string): boolean {
  const computed = Buffer.from(sha256Base64Url(verifier));
  const expected = Buffer.from(challenge);
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}
