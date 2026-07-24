import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/config/env";
import { OAUTH_CONSENT_CSRF_MAX_AGE_SECONDS, OAUTH_REQUEST_TIMEOUT_MS } from "@/constants/oauth";
import { db } from "@/db/client";
import { CSRF_COOKIE, mintCsrfToken, validateCsrf } from "@/features/auth/csrf";
import { loadLiveSessionByToken, SESSION_COOKIE } from "@/features/auth/session";
import {
  type AuthorizationRequest,
  authorizationPostQueryInput,
  authorizationRequestInput,
  authorizationSearchParams,
  issueAuthCode,
} from "@/features/oauth/authorize";
import { getClient } from "@/features/oauth/clients";

const consentDecisionInput = z.object({ decision: z.enum(["approve", "deny"]) });

const CSRF_COOKIE_OPTIONS = {
  httpOnly: false,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: OAUTH_CONSENT_CSRF_MAX_AGE_SECONDS,
};

function invalidRequest(error: string): Response {
  return NextResponse.json({ error }, { status: 400 });
}

function authorizationPath(input: AuthorizationRequest): string {
  return `/oauth/authorize?${authorizationSearchParams(input).toString()}`;
}

function loginRedirect(input: AuthorizationRequest): Response {
  const target = new URL("/auth/start", env.BASE_URL);
  target.searchParams.set("next", authorizationPath(input));
  return NextResponse.redirect(target, { status: 302 });
}

function clientRedirect(redirectUri: string, values: Record<string, string>): Response {
  const target = new URL(redirectUri);
  for (const [name, value] of Object.entries(values)) target.searchParams.set(name, value);
  return NextResponse.redirect(target, { status: 302 });
}

async function sessionUserId(req: NextRequest, signal: AbortSignal): Promise<string | null> {
  const sid = req.cookies.get(SESSION_COOKIE)?.value;
  if (sid === undefined) return null;
  const session = await loadLiveSessionByToken(db, sid, signal);
  return session.ok ? session.value.userId : null;
}

async function isRegisteredRedirect(
  clientId: string,
  redirectUri: string,
  signal: AbortSignal,
): Promise<boolean> {
  const client = await getClient(db, clientId, signal);
  return client?.redirectUris.includes(redirectUri) ?? false;
}

export async function GET(req: NextRequest): Promise<Response> {
  if (!env.MCP_ENABLED) return new NextResponse("Not found", { status: 404 });
  const parsed = authorizationRequestInput.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return invalidRequest("invalid_request");

  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS)]);
  if (!(await isRegisteredRedirect(parsed.data.client_id, parsed.data.redirect_uri, signal))) {
    return invalidRequest("invalid_client");
  }
  if ((await sessionUserId(req, signal)) === null) return loginRedirect(parsed.data);

  const consentUrl = new URL("/oauth/authorize/consent", env.BASE_URL);
  consentUrl.search = authorizationSearchParams(parsed.data).toString();
  const response = NextResponse.redirect(consentUrl, { status: 302 });
  if (req.cookies.get(CSRF_COOKIE) === undefined) {
    response.cookies.set(CSRF_COOKIE, mintCsrfToken(), CSRF_COOKIE_OPTIONS);
  }
  return response;
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!env.MCP_ENABLED) return new NextResponse("Not found", { status: 404 });
  const parsed = authorizationPostQueryInput.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  if (!parsed.success) return invalidRequest("invalid_request");
  const { csrf_token: csrfToken, ...authorization } = parsed.data;

  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS)]);
  if (!(await isRegisteredRedirect(authorization.client_id, authorization.redirect_uri, signal))) {
    return invalidRequest("invalid_client");
  }
  const userId = await sessionUserId(req, signal);
  if (userId === null) return loginRedirect(authorization);

  const csrf = validateCsrf({
    cookieToken: req.cookies.get(CSRF_COOKIE)?.value ?? null,
    headerToken: csrfToken,
    origin: req.headers.get("origin"),
    host: req.headers.get("host"),
    secFetchSite: req.headers.get("sec-fetch-site"),
  });
  if (!csrf.ok) return NextResponse.json({ error: "access_denied" }, { status: 403 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    signal.throwIfAborted();
    return invalidRequest("invalid_request");
  }
  signal.throwIfAborted();
  const decision = consentDecisionInput.safeParse({ decision: formData.get("decision") });
  if (!decision.success) return invalidRequest("invalid_request");
  if (decision.data.decision === "deny") {
    return clientRedirect(authorization.redirect_uri, {
      error: "access_denied",
      state: authorization.state,
    });
  }

  const code = await issueAuthCode(
    db,
    {
      clientId: authorization.client_id,
      userId,
      redirectUri: authorization.redirect_uri,
      codeChallenge: authorization.code_challenge,
    },
    signal,
  );
  return clientRedirect(authorization.redirect_uri, { code, state: authorization.state });
}
