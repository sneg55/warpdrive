import { createRemoteJWKSet } from "jose";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/config/env";
import { db } from "@/db/client";
import { upsertUserOnLogin } from "@/features/auth/bootstrap";
import { finishLogin } from "@/features/auth/finishLogin";
import { LOGIN_RETURN_COOKIE, safeLoginReturnPath } from "@/features/auth/loginReturn";
import { fetchOidcConfig, parseAllowedGroups, verifyOidcIdToken } from "@/features/auth/oidc";
import { err, ok, type Result } from "@/types/result";

const STATE_COOKIE = "wd_oauth_state";
const NONCE_COOKIE = "wd_oauth_nonce";
const PKCE_COOKIE = "wd_oauth_pkce_verifier";

const tokenResponseSchema = z.object({
  id_token: z.string().min(1),
  access_token: z.string().min(1),
  token_type: z.string(),
});

function loginError(reason: string): NextResponse {
  console.warn("[auth/callback/oidc] login rejected:", reason);
  return NextResponse.redirect(new URL("/login?error=auth_failed", env.BASE_URL));
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  const raw = `${clientId}:${clientSecret}`;
  return `Basic ${Buffer.from(raw, "utf8").toString("base64")}`;
}

async function exchangeCode(args: {
  tokenEndpoint: string;
  code: string;
  codeVerifier: string;
  signal: AbortSignal;
}): Promise<Result<string, "token_exchange_failed">> {
  let res: Response;
  try {
    res = await fetch(args.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: basicAuthHeader(env.OIDC_CLIENT_ID, env.OIDC_CLIENT_SECRET),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: args.code,
        redirect_uri: `${env.BASE_URL}/auth/callback/oidc`,
        code_verifier: args.codeVerifier,
      }),
      signal: args.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return err("token_exchange_failed");
    throw e;
  }
  args.signal.throwIfAborted();
  if (!res.ok) return err("token_exchange_failed");
  const parsed = tokenResponseSchema.safeParse(await res.json());
  if (!parsed.success) return err("token_exchange_failed");
  return ok(parsed.data.id_token);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
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

  const issuer = env.OIDC_ISSUER_URL ?? "";
  const config = await fetchOidcConfig(issuer, signal, { fetchImpl: fetch });
  if (config.ok === false) return loginError("provider discovery unavailable");

  const exchanged = await exchangeCode({
    tokenEndpoint: config.value.tokenEndpoint,
    code,
    codeVerifier: pkceVerifier,
    signal,
  });
  if (exchanged.ok === false) return loginError("token exchange failed");

  const jwks = createRemoteJWKSet(new URL(config.value.jwksUri));
  const verifyResult = await verifyOidcIdToken(exchanged.value, {
    getKey: jwks,
    clientId: env.OIDC_CLIENT_ID,
    nonce: nonceCookie,
    issuer,
    allowedGroups: parseAllowedGroups(env.OIDC_ALLOWED_GROUPS),
    signal,
  });
  if (verifyResult.ok === false) return loginError("id token verification failed");
  const identity = verifyResult.value;

  try {
    const upsertResult = await upsertUserOnLogin(
      db,
      {
        provider: issuer,
        identity: {
          email: identity.email,
          sub: identity.sub,
          name: identity.name,
          preferredUsername: identity.preferredUsername,
          avatarUrl: identity.avatarUrl,
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
