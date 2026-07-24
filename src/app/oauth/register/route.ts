import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { OAUTH_REQUEST_TIMEOUT_MS } from "@/constants/oauth";
import { db } from "@/db/client";
import {
  clientRegistrationInput,
  registerClient,
  sanitizeClientName,
} from "@/features/oauth/clients";
import { checkRateLimit, tooManyRequestsResponse } from "@/server/rateLimitGuard";

export async function POST(req: Request): Promise<Response> {
  if (!env.MCP_ENABLED) return new NextResponse("Not found", { status: 404 });
  // A deploy that has finished connecting its clients can close this door. 404 rather than 403
  // to match the MCP_ENABLED kill switch above and to say nothing about what exists here.
  if (env.OAUTH_REGISTRATION === "disabled") {
    return new NextResponse("Not found", { status: 404 });
  }
  // Reject anything that is not a JSON API call BEFORE spending the caller's quota. A cross-site
  // <form> POST or a no-cors fetch from a hostile page cannot set Content-Type: application/json
  // (it is not CORS-safelisted), so those forced cross-origin requests land here and are turned
  // away for free. Without this gate they would each consume the per-address allowance and then
  // fail JSON parsing anyway, letting any web page burn the registration quota of whatever real
  // MCP client shares the visitor's forwarded address.
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "invalid_client_metadata" }, { status: 400 });
  }

  // Registering a client is a once-per-integration act, and each real call writes a row on behalf
  // of an unauthenticated stranger. Only genuine JSON attempts (which reached here) spend quota.
  const limit = checkRateLimit("oauthRegister", req.headers);
  if (!limit.allowed) return tooManyRequestsResponse(limit);

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
      // Stripped of control and bidi-override characters before it is stored, because this is
      // the string the consent screen shows a user while they decide whether to grant CRM
      // access, and it was written by whoever called this endpoint.
      name: sanitizeClientName(parsed.data.client_name ?? ""),
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
