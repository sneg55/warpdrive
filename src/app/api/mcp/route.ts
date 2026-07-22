import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { env } from "@/config/env";
import { db } from "@/db/client";
import { authenticateMcp } from "@/features/mcp/auth";
import { registerMcpTools } from "@/features/mcp/server";
import type { AppContext } from "@/server/trpc/context";

export const runtime = "nodejs";

const requestContexts = new WeakMap<Request, AppContext>();
const resourceOrigin = env.BASE_URL.replace(/\/$/, "");
const resourceMetadataUrl = new URL(
  "/.well-known/oauth-protected-resource",
  env.BASE_URL,
).toString();

async function verifyRequest(req: Request): Promise<AuthInfo | undefined> {
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(10_000)]);
  const authenticated = await authenticateMcp(db, req.headers.get("authorization"), signal);
  if (!authenticated.ok) return undefined;
  requestContexts.set(req, authenticated.value.ctx);
  return authenticated.value.authInfo;
}

async function handleAuthenticatedRequest(req: Request): Promise<Response> {
  const ctx = requestContexts.get(req);
  if (ctx === undefined) {
    return new Response(null, {
      status: 401,
      headers: { "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"` },
    });
  }

  const handler = createMcpHandler(
    (server) => registerMcpTools(server, () => ctx, db),
    { serverInfo: { name: "warpdrive", version: "1.0.0" } },
    { basePath: "/api", disableSse: true, sessionIdGenerator: undefined },
  );
  return handler(req);
}

const authenticatedHandler = withMcpAuth(handleAuthenticatedRequest, verifyRequest, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
  resourceUrl: resourceOrigin,
});

async function route(req: Request): Promise<Response> {
  if (!env.MCP_ENABLED) return new Response(null, { status: 404 });
  return authenticatedHandler(req);
}

export { route as GET, route as POST };
