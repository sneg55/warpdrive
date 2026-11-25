import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { registerClient } from "@/features/oauth/clients";
import { makeTestDb, type TestDb } from "@/test/db";
import type * as RouteModule from "./route";

const providers = vi.hoisted(() => ({ google: true, oidc: false }));

vi.mock("@/features/auth/enabledProviders", () => ({
  enabledSigninProviders: () => providers,
}));

const REDIRECT_URI = "http://127.0.0.1:8123/callback";
const CODE_CHALLENGE = "a".repeat(43);

let h: TestDb;
let clientId: string;
let route: typeof RouteModule;

beforeAll(async () => {
  h = await makeTestDb();
  vi.stubEnv("DATABASE_URL", h.url);
  vi.resetModules();
  route = await import("./route");
  const registered = await registerClient(
    h.db,
    { name: "MCP client", redirectUris: [REDIRECT_URI] },
    AbortSignal.timeout(8000),
  );
  clientId = registered.clientId;
});

afterAll(async () => {
  const { pool } = await import("@/db/client");
  await pool.end();
  vi.unstubAllEnvs();
  await h.close();
});

function setProviders(next: Partial<typeof providers>): void {
  Object.assign(providers, next);
}

function authorizeUrl(extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    code_challenge: CODE_CHALLENGE,
    code_challenge_method: "S256",
    state: "xyz",
    ...extra,
  });
  return `https://app.example.com/oauth/authorize?${params.toString()}`;
}

function signedOutRedirect(response: Response): { pathname: string; next: URL } {
  expect(response.status).toBe(302);
  const location = new URL(response.headers.get("location") ?? "");
  expect(location.origin).toBe("https://app.example.com");
  const next = new URL(location.searchParams.get("next") ?? "", "https://app.example.com");
  return { pathname: location.pathname, next };
}

describe("oauth authorize: signed-out users are sent to an enabled sign-in provider", () => {
  test("google only goes straight to the google start with the authorize request as next", async () => {
    setProviders({ google: true, oidc: false });
    const response = await route.GET(new NextRequest(authorizeUrl()));
    const { pathname, next } = signedOutRedirect(response);
    expect(pathname).toBe("/auth/start/google");
    expect(next.pathname).toBe("/oauth/authorize");
    expect(next.searchParams.get("client_id")).toBe(clientId);
    expect(next.searchParams.get("state")).toBe("xyz");
  });

  test("oidc only goes straight to the oidc start, not to google", async () => {
    setProviders({ google: false, oidc: true });
    const response = await route.GET(new NextRequest(authorizeUrl()));
    const { pathname, next } = signedOutRedirect(response);
    expect(pathname).toBe("/auth/start/oidc");
    expect(next.pathname).toBe("/oauth/authorize");
    expect(next.searchParams.get("client_id")).toBe(clientId);
  });

  test("both providers go to the login page with next preserved", async () => {
    setProviders({ google: true, oidc: true });
    const response = await route.GET(new NextRequest(authorizeUrl()));
    const { pathname, next } = signedOutRedirect(response);
    expect(pathname).toBe("/login");
    expect(next.pathname).toBe("/oauth/authorize");
    expect(next.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
  });

  test("the consent post of a signed-out user is routed the same way", async () => {
    setProviders({ google: false, oidc: true });
    const response = await route.POST(
      new NextRequest(authorizeUrl({ csrf_token: "t" }), { method: "POST" }),
    );
    const { pathname, next } = signedOutRedirect(response);
    expect(pathname).toBe("/auth/start/oidc");
    expect(next.pathname).toBe("/oauth/authorize");
    expect(next.searchParams.has("csrf_token")).toBe(false);
  });
});
