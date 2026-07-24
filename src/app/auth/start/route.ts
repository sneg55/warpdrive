import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/config/env";
import { buildAuthUrl, generatePkce } from "@/features/auth/google";
import { LOGIN_RETURN_COOKIE, safeLoginReturnPath } from "@/features/auth/loginReturn";
import { checkRateLimit, tooManyRequestsResponse } from "@/server/rateLimitGuard";

const STATE_COOKIE = "wd_oauth_state";
const NONCE_COOKIE = "wd_oauth_nonce";
const PKCE_COOKIE = "wd_oauth_pkce_verifier";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 10, // 10 minutes
};

// GET /auth/start: build the Google OAuth redirect, set state/nonce/PKCE cookies.
export async function GET(req: NextRequest): Promise<Response> {
  // Starting a login is a human act with a redirect in the middle; nobody legitimately does it
  // twenty times a minute. Each call mints two 32-byte secrets, a PKCE pair and four cookies.
  const limit = checkRateLimit("authStart", req.headers);
  if (!limit.allowed) return tooManyRequestsResponse(limit);

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

  const url = buildAuthUrl({ state, nonce, codeChallenge: challenge });
  return NextResponse.redirect(url);
}
