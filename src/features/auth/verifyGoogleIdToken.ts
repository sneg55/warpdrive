import { type JWTVerifyGetKey, errors as joseErrors, jwtVerify } from "jose";
import { err, ok, type Result } from "@/types/result";
import { idTokenClaimsSchema } from "./schemas";

export interface VerifyGoogleIdTokenDeps {
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
