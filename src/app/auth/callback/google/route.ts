import { createRemoteJWKSet } from "jose";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/config/env";
import { db } from "@/db/client";
import { upsertUserOnLogin } from "@/features/auth/bootstrap";
import { enabledSigninProviders } from "@/features/auth/enabledProviders";
import { finishLogin } from "@/features/auth/finishLogin";
import { LOGIN_RETURN_COOKIE, safeLoginReturnPath } from "@/features/auth/loginReturn";
import { verifyGoogleIdToken } from "@/features/auth/verifyGoogleIdToken";
import { err, ok, type Result } from "@/types/result";

const STATE_COOKIE = "wd_oauth_state";
const NONCE_COOKIE = "wd_oauth_nonce";
const PKCE_COOKIE = "wd_oauth_pkce_verifier";

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

const googleJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

const tokenResponseSchema = z.object({
  id_token: z.string().min(1),
  access_token: z.string().min(1),
  token_type: z.string(),
});

function loginError(reason: string): NextResponse {
  console.warn("[auth/callback/google] login rejected:", reason);
  return NextResponse.redirect(new URL("/login?error=auth_failed", env.BASE_URL));
}

async function exchangeCodeForIdToken(
  code: string,
  codeVerifier: string,
  signal: AbortSignal,
): Promise<Result<string, string>> {
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
        code_verifier: codeVerifier,
      }),
      signal,
    });
    signal.throwIfAborted();
    if (!tokenRes.ok) return err("token exchange failed");
    const parsed = tokenResponseSchema.safeParse(await tokenRes.json());
    if (!parsed.success) return err("token response invalid");
    return ok(parsed.data.id_token);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return err("token exchange timed out");
    throw e;
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!enabledSigninProviders().google) return loginError("google sign-in is disabled");

  const signal = AbortSignal.timeout(10_000);
  const jar = await cookies();

  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");

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

  jar.delete(STATE_COOKIE);
  jar.delete(NONCE_COOKIE);
  jar.delete(PKCE_COOKIE);
  jar.delete(LOGIN_RETURN_COOKIE);

  const exchanged = await exchangeCodeForIdToken(code, pkceVerifier, signal);
  if (exchanged.ok === false) return loginError(exchanged.error);
  const idToken = exchanged.value;

  const verifyResult = await verifyGoogleIdToken(idToken, {
    getKey: googleJwks,
    clientId: env.GOOGLE_OAUTH_CLIENT_ID,
    nonce: nonceCookie,
    workspaceDomain: env.GOOGLE_WORKSPACE_DOMAIN,
    signal,
  });
  if (verifyResult.ok === false) return loginError("id token verification failed");
  const verified = verifyResult.value;

  try {
    const upsertResult = await upsertUserOnLogin(
      db,
      {
        provider: "google",
        identity: {
          email: verified.email,
          sub: verified.sub,
          name: verified.name,
          preferredUsername: null,
          avatarUrl: verified.avatarUrl,
        },
      },
      signal,
    );
    if (upsertResult.ok === false) return loginError(`user upsert failed: ${upsertResult.error}`);

    const finished = await finishLogin({
      db,
      userId: upsertResult.value.userId,
      returnPath,
      signal,
    });
    if (finished.ok === false) return loginError("session creation failed");
    return finished.value;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return loginError("login flow timed out");
    throw e;
  }
}
