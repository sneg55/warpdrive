/**
 * The SINGLE Google ID token verification path (used by /auth/callback in production
 * AND by the security tests). Do not re-implement jwtVerify elsewhere.
 *
 * 1. Verifies signature against the injected JWKS key-getter (real key check via jose).
 * 2. Enforces iss, aud, exp (jose).
 * 3. Validates the decoded claims (email_verified, nonce, hd) against injected values.
 *
 * The key-getter is injectable so the route passes a remote JWKS and tests pass a
 * local fake JWKS, both exercising the exact same verification code.
 */
import { type JWTVerifyGetKey, errors as joseErrors, jwtVerify } from "jose";
import { err, ok, type Result } from "@/types/result";
import { idTokenClaimsSchema } from "./schemas";

export interface VerifyGoogleIdTokenDeps {
  // Resolved JWKS key-getter: createRemoteJWKSet(...) or createLocalJWKSet(...).
  getKey: JWTVerifyGetKey;
  clientId: string;
  nonce: string;
  workspaceDomain: string;
  signal: AbortSignal;
}

export interface VerifiedGoogleIdentity {
  email: string;
  sub: string;
  name: string;
  avatarUrl: string | null;
}

export async function verifyGoogleIdToken(
  idToken: string,
  deps: VerifyGoogleIdTokenDeps,
): Promise<Result<VerifiedGoogleIdentity, "rejected">> {
  deps.signal.throwIfAborted();

  let payload: Record<string, unknown>;
  try {
    const { payload: verified } = await jwtVerify(idToken, deps.getKey, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: deps.clientId,
    });
    payload = verified;
  } catch (e) {
    if (e instanceof joseErrors.JOSEError) return err("rejected");
    throw e;
  }

  deps.signal.throwIfAborted();

  // Single authority for claim checks. aud/iss are already enforced by jose above;
  // here we own email_verified, nonce, and hd against the injected workspace domain.
  const parsed = idTokenClaimsSchema.safeParse(payload);
  if (!parsed.success) return err("rejected");
  const c = parsed.data;

  if (c.email_verified !== true) return err("rejected");
  if (c.nonce !== deps.nonce) return err("rejected");
  if (c.hd === undefined) return err("rejected");
  if (c.hd.toLowerCase() !== deps.workspaceDomain.toLowerCase()) return err("rejected");

  return ok({
    email: c.email.trim().toLowerCase(),
    sub: c.sub,
    name: c.name,
    avatarUrl: c.picture ?? null,
  });
}
