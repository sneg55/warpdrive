import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { OAUTH_REQUEST_TIMEOUT_MS } from "@/constants/oauth";
import { db } from "@/db/client";
import { clientRegistrationInput, registerClient } from "@/features/oauth/clients";

export async function POST(req: Request): Promise<Response> {
  if (!env.MCP_ENABLED) return new NextResponse("Not found", { status: 404 });

  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS)]);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_client_metadata" }, { status: 400 });
  }
  signal.throwIfAborted();
  const parsed = clientRegistrationInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_client_metadata" }, { status: 400 });
  }

  const { clientId } = await registerClient(
    db,
    {
      name: parsed.data.client_name ?? "MCP client",
      redirectUris: parsed.data.redirect_uris,
    },
    signal,
  );
  return NextResponse.json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1_000),
      redirect_uris: parsed.data.redirect_uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    { status: 201 },
  );
}
