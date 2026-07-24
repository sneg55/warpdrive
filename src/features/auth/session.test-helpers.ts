import { randomBytes } from "node:crypto";

/**
 * Values for inserting a session row directly in a test fixture.
 *
 * sessions.token_hash is NOT NULL because in production every session is created through
 * createSession, which always has a token to hash. Fixtures that only need a session to exist
 * (and then refer to it by its internal id) still have to supply something unique, so this
 * generates a throwaway digest-shaped value.
 *
 * If a test needs the value to be usable as a COOKIE, it must call createSession instead: only
 * that path returns the pre-image, and by design nothing can recover it from the stored hash.
 */
export function sessionFixture(args: { userId: string; expiresAt: Date }) {
  return { ...args, tokenHash: randomBytes(32).toString("base64url") };
}
