import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/config/env";
import { ACCESS_TOKEN_TTL_SECONDS, OAUTH_REQUEST_TIMEOUT_MS } from "@/constants/oauth";
import { db } from "@/db/client";
import { consumeAuthCode } from "@/features/oauth/authorize";
import { issueAccessToken, issueRefreshToken, rotateRefreshToken } from "@/features/oauth/tokens";

const authorizationCodeInput = z.object({
  grant_type: z.literal("authorization_code"),
  code: z.string().min(1),
  code_verifier: z.string().min(43).max(128),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  resource: z.string().url().optional(),
});

const refreshTokenInput = z.object({
  grant_type: z.literal("refresh_token"),
  refresh_token: z.string().min(1),
  client_id: z.string().min(1),
  resource: z.string().url().optional(),
});

const tokenRequestInput = z.discriminatedUnion("grant_type", [
  authorizationCodeInput,
  refreshTokenInput,
]);

function json(body: unknown, status = 200): Response {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
  });
}

async function readBody(req: Request, signal: AbortSignal): Promise<unknown> {
  const contentType = req.headers.get("content-type") ?? "";
  let body: unknown;
  if (contentType.startsWith("application/json")) {
    body = await req.json();
  } else {
    body = Object.fromEntries(await req.formData());
  }
  signal.throwIfAborted();
  return body;
}

export async function POST(req: Request): Promise<Response> {
  if (!env.MCP_ENABLED) return new NextResponse("Not found", { status: 404 });
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS)]);
  let raw: unknown;
  try {
    raw = await readBody(req, signal);
  } catch {
    signal.throwIfAborted();
    return json({ error: "invalid_request" }, 400);
  }
  const parsed = tokenRequestInput.safeParse(raw);
  if (!parsed.success) return json({ error: "invalid_request" }, 400);

  if (parsed.data.grant_type === "authorization_code") {
    const consumed = await consumeAuthCode(
      db,
      {
        code: parsed.data.code,
        clientId: parsed.data.client_id,
        redirectUri: parsed.data.redirect_uri,
        codeVerifier: parsed.data.code_verifier,
      },
      signal,
    );
    if (!consumed.ok) return json({ error: "invalid_grant" }, 400);

    const owner = { clientId: parsed.data.client_id, userId: consumed.value.userId };
    const [{ token }, refreshToken] = await Promise.all([
      issueAccessToken(db, owner, signal),
      issueRefreshToken(db, owner, signal),
    ]);
    signal.throwIfAborted();
    return json({
      access_token: token,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
    });
  }

  const rotated = await rotateRefreshToken(
    db,
    parsed.data.refresh_token,
    signal,
    parsed.data.client_id,
  );
  if (!rotated.ok) return json({ error: "invalid_grant" }, 400);
  const { token } = await issueAccessToken(db, rotated.value, signal);
  return json({
    access_token: token,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: rotated.value.refreshToken,
  });
}
