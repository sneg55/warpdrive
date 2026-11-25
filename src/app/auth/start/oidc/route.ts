import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/config/env";
import { generatePkce } from "@/features/auth/google";
import { LOGIN_RETURN_COOKIE, safeLoginReturnPath } from "@/features/auth/loginReturn";
import { buildOidcAuthUrl, fetchOidcConfig } from "@/features/auth/oidc";
import { checkRateLimit, tooManyRequestsResponse } from "@/server/rateLimitGuard";

const STATE_COOKIE = "wd_oauth_state";
const NONCE_COOKIE = "wd_oauth_nonce";
const PKCE_COOKIE = "wd_oauth_pkce_verifier";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 10,
};

export async function GET(req: NextRequest): Promise<Response> {
  const limit = checkRateLimit("authStart", req.headers);
  if (!limit.allowed) return tooManyRequestsResponse(limit);

  const signal = AbortSignal.timeout(10_000);
  if (!env.oidcEnabled) {
    return NextResponse.redirect(new URL("/login?error=auth_failed", env.BASE_URL));
  }
  const issuer = env.OIDC_ISSUER_URL ?? "";
  const config = await fetchOidcConfig(issuer, signal, { fetchImpl: fetch });
  if (!config.ok) {
    return NextResponse.redirect(new URL("/login?error=auth_failed", env.BASE_URL));
  }

  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const { verifier, challenge } = generatePkce();

  const jar = await cookies();
  jar.set(STATE_COOKIE, state, COOKIE_OPTS);
  jar.set(NONCE_COOKIE, nonce, COOKIE_OPTS);
  jar.set(PKCE_COOKIE, verifier, COOKIE_OPTS);
  jar.set(
    LOGIN_RETURN_COOKIE,
    safeLoginReturnPath(req.nextUrl.searchParams.get("next")),
    COOKIE_OPTS,
  );

  const url = buildOidcAuthUrl({
    config: config.value,
    clientId: env.OIDC_CLIENT_ID,
    redirectUri: `${env.BASE_URL}/auth/callback/oidc`,
    state,
    nonce,
    codeChallenge: challenge,
  });
  return NextResponse.redirect(url);
}
