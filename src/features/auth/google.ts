import { createHash, randomBytes } from "node:crypto";
import { env } from "@/config/env";
import { err, ok, type Result } from "@/types/result";
import { idTokenClaimsSchema } from "./schemas";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

export function buildAuthUrl(args: {
  state: string;
  nonce: string;
  codeChallenge: string;
}): string {
  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", env.GOOGLE_OAUTH_CLIENT_ID);
  url.searchParams.set("redirect_uri", `${env.BASE_URL}/auth/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", args.state);
  url.searchParams.set("nonce", args.nonce);
  url.searchParams.set("code_challenge", args.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("hd", env.GOOGLE_WORKSPACE_DOMAIN);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

interface VerifyArgs {
  nonce: string;
  signal: AbortSignal;
}

interface VerifiedIdentity {
  email: string;
  sub: string;
  name: string;
  avatarUrl: string | null;
}

// Validates the DECODED claim set (signature/iss re-checked by jose in the route).
// Domain membership uses the hd claim exactly, NOT an email-suffix match (ops spec E6).
export function verifyIdTokenClaims(
  raw: unknown,
  args: VerifyArgs,
): Result<VerifiedIdentity, "rejected"> {
  args.signal.throwIfAborted();
  const parsed = idTokenClaimsSchema.safeParse(raw);
  if (!parsed.success) return err("rejected");
  const c = parsed.data;

  if (c.email_verified !== true) return err("rejected");
  if (c.aud !== env.GOOGLE_OAUTH_CLIENT_ID) return err("rejected");
  if (c.iss !== "https://accounts.google.com" && c.iss !== "accounts.google.com") {
    return err("rejected");
  }
  if (c.nonce !== args.nonce) return err("rejected");
  if (c.hd === undefined) return err("rejected");
  if (c.hd.toLowerCase() !== env.GOOGLE_WORKSPACE_DOMAIN.toLowerCase()) return err("rejected");

  return ok({
    email: c.email.trim().toLowerCase(),
    sub: c.sub,
    name: c.name,
    avatarUrl: c.picture ?? null,
  });
}
