import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type * as RouteModule from "./route";

const ISSUER = "https://idp.example.com";
const COOKIES: Record<string, string> = {
  wd_oauth_state: "state-1",
  wd_oauth_nonce: "nonce-1",
  wd_oauth_pkce_verifier: "verifier-1",
};

const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(jar) }));

const fetchMock = vi.fn();
let tokenAuthorization: string | undefined;

async function loadRoute(clientId: string, clientSecret: string): Promise<typeof RouteModule> {
  vi.stubEnv("OIDC_ISSUER_URL", ISSUER);
  vi.stubEnv("OIDC_CLIENT_ID", clientId);
  vi.stubEnv("OIDC_CLIENT_SECRET", clientSecret);
  vi.stubEnv("OIDC_ALLOWED_GROUPS", "warpdrive-users");
  vi.resetModules();
  return import("./route");
}

function decodedCredentials(): string {
  const header = tokenAuthorization ?? "";
  expect(header.startsWith("Basic ")).toBe(true);
  return Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
}

async function runCallback(route: typeof RouteModule): Promise<void> {
  await route.GET(
    new NextRequest("https://app.example.com/auth/callback/oidc?code=code-1&state=state-1"),
  );
}

beforeEach(() => {
  tokenAuthorization = undefined;
  fetchMock.mockReset();
  fetchMock.mockImplementation((input: unknown, init?: { headers?: Record<string, string> }) => {
    if (String(input).includes(".well-known")) {
      return Promise.resolve(
        Response.json({
          issuer: ISSUER,
          authorization_endpoint: `${ISSUER}/authorize`,
          token_endpoint: `${ISSUER}/token`,
          jwks_uri: `${ISSUER}/jwks.json`,
        }),
      );
    }
    tokenAuthorization = init?.headers?.Authorization;
    return Promise.resolve(new Response("{}", { status: 400 }));
  });
  vi.stubGlobal("fetch", fetchMock);
  jar.get.mockImplementation((name: string) => {
    const value = COOKIES[name];
    return value === undefined ? undefined : { name, value };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("oidc callback token request uses client_secret_basic", () => {
  test("form-urlencodes the client id and secret before joining them with a colon", async () => {
    await runCallback(await loadRoute("app:one", "s3cr&t:/+ ~!"));
    expect(decodedCredentials()).toBe("app%3Aone:s3cr%26t%3A%2F%2B+%7E%21");
  });

  test("a colon in the client id cannot be mistaken for the separator", async () => {
    await runCallback(await loadRoute("a:b:c", "secret"));
    expect(decodedCredentials().split(":")).toHaveLength(2);
  });

  test("leaves plain credentials unchanged", async () => {
    await runCallback(await loadRoute("warpdrive", "0123456789abcdef"));
    expect(decodedCredentials()).toBe("warpdrive:0123456789abcdef");
  });
});
