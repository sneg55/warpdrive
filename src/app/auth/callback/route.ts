/**
 * /auth/callback: OAuth2 callback from Google.
 *
 * Security invariants (ops spec A0, E6):
 * 1. State cookie vs query-param comparison (login-CSRF protection).
 * 2. Real ID token signature verification via jose + Google JWKS (signature + iss + aud + exp).
 * 3. upsertUserOnLogin wrapped in try/catch; infra failures redirect, never 500.
 * 4. Session cookie set with httpOnly/secure/sameSite on success.
 */

import { createRemoteJWKSet } from "jose";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/config/env";
import { db } from "@/db/client";
import { upsertUserOnLogin } from "@/features/auth/bootstrap";
import { CSRF_COOKIE, mintCsrfToken } from "@/features/auth/csrf";
import { LOGIN_RETURN_COOKIE, safeLoginReturnPath } from "@/features/auth/loginReturn";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/features/auth/session";
import { verifyGoogleIdToken } from "@/features/auth/verifyGoogleIdToken";

const STATE_COOKIE = "wd_oauth_state";
const NONCE_COOKIE = "wd_oauth_nonce";
const PKCE_COOKIE = "wd_oauth_pkce_verifier";

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

// Resolved once at module load; jose caches and refreshes the key set internally.
const googleJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

const tokenResponseSchema = z.object({
  id_token: z.string().min(1),
  access_token: z.string().min(1),
  token_type: z.string(),
});

function loginError(reason: string): NextResponse {
  console.warn("[auth/callback] login rejected:", reason);
  return NextResponse.redirect(new URL("/login?error=auth_failed", env.BASE_URL));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const signal = AbortSignal.timeout(10_000);
  const jar = await cookies();

  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");

  // 1. State cookie check (login-CSRF protection).
  const stateCookie = jar.get(STATE_COOKIE)?.value ?? null;
  const nonceCookie = jar.get(NONCE_COOKIE)?.value ?? null;
  const pkceVerifier = jar.get(PKCE_COOKIE)?.value ?? null;
  const returnPath = safeLoginReturnPath(jar.get(LOGIN_RETURN_COOKIE)?.value);

  if (
    code === null ||
    stateParam === null ||
    stateCookie === null ||
    nonceCookie === null ||
    pkceVerifier === null
  ) {
    return loginError("missing params or cookies");
  }

  if (stateParam !== stateCookie) {
    return loginError("state mismatch");
  }

  // Clear one-time cookies immediately after validating state.
  jar.delete(STATE_COOKIE);
  jar.delete(NONCE_COOKIE);
  jar.delete(PKCE_COOKIE);
  jar.delete(LOGIN_RETURN_COOKIE);

  // 2. Exchange code for tokens at Google's token endpoint.
  let idToken: string;
  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_OAUTH_CLIENT_ID,
        client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
        redirect_uri: `${env.BASE_URL}/auth/callback`,
        grant_type: "authorization_code",
        code_verifier: pkceVerifier,
      }),
      signal,
    });
    signal.throwIfAborted();
    if (!tokenRes.ok) return loginError("token exchange failed");
    const parsed = tokenResponseSchema.safeParse(await tokenRes.json());
    if (!parsed.success) return loginError("token response invalid");
    idToken = parsed.data.id_token;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError")
      return loginError("token exchange timed out");
    throw e;
  }

  // 3. THE single ID-token verification path (signature + iss + aud + exp via jose, then
  //    email_verified/nonce/hd). Same function the security tests exercise; do not inline here.
  const verifyResult = await verifyGoogleIdToken(idToken, {
    getKey: googleJwks,
    clientId: env.GOOGLE_OAUTH_CLIENT_ID,
    nonce: nonceCookie,
    workspaceDomain: env.GOOGLE_WORKSPACE_DOMAIN,
    signal,
  });
  if (verifyResult.ok === false) return loginError("id token verification failed");
  const identity = verifyResult.value;

  // 4. Upsert user, create session, set session cookie.
  try {
    const upsertResult = await upsertUserOnLogin(db, identity, signal);
    if (upsertResult.ok === false) return loginError("user upsert failed");

    const sessionResult = await createSession(db, upsertResult.value.userId, signal);
    if (sessionResult.ok === false) return loginError("session creation failed");

    const { sid, expiresAt } = sessionResult.value;
    const csrfToken = mintCsrfToken();
    const res = NextResponse.redirect(new URL(returnPath, env.BASE_URL));
    res.cookies.set(SESSION_COOKIE, sid, { ...sessionCookieOptions(), expires: expiresAt });
    // Double-submit CSRF token: httpOnly false so client JS can read it for form submissions.
    res.cookies.set(CSRF_COOKIE, csrfToken, {
      httpOnly: false,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    return res;
  } catch (e) {
    console.error("[auth/callback] infra error during login:", e);
    return loginError("internal error");
  }
}
