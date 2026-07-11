import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { buildAuthUrl, generatePkce } from "@/features/auth/google";

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
export async function GET(): Promise<NextResponse> {
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const { verifier, challenge } = generatePkce();

  const jar = await cookies();
  jar.set(STATE_COOKIE, state, COOKIE_OPTS);
  jar.set(NONCE_COOKIE, nonce, COOKIE_OPTS);
  jar.set(PKCE_COOKIE, verifier, COOKIE_OPTS);

  const url = buildAuthUrl({ state, nonce, codeChallenge: challenge });
  return NextResponse.redirect(url);
}
