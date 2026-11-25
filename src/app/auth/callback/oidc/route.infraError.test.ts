import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type * as OidcModule from "@/features/auth/oidc";
import type * as RouteModule from "./route";

const ISSUER = "https://idp.example.com";
const COOKIES: Record<string, string> = {
  wd_oauth_state: "state-1",
  wd_oauth_nonce: "nonce-1",
  wd_oauth_pkce_verifier: "verifier-1",
};

const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }));
const upsert = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(jar) }));
vi.mock("@/features/auth/bootstrap", () => ({ upsertUserOnLogin: upsert }));
vi.mock("@/features/auth/oidc", async (importOriginal) => ({
  ...(await importOriginal<typeof OidcModule>()),
  verifyOidcIdToken: () =>
    Promise.resolve({
      ok: true,
      value: {
        email: "a@example.com",
        sub: "o-1",
        name: "A",
        preferredUsername: null,
        avatarUrl: null,
        groups: ["warpdrive-users"],
      },
    }),
}));

async function loadRoute(): Promise<typeof RouteModule> {
  vi.stubEnv("OIDC_ISSUER_URL", ISSUER);
  vi.stubEnv("OIDC_CLIENT_ID", "warpdrive");
  vi.stubEnv("OIDC_CLIENT_SECRET", "x".repeat(16));
  vi.stubEnv("OIDC_ALLOWED_GROUPS", "warpdrive-users");
  vi.resetModules();
  return import("./route");
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: unknown) => {
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
      return Promise.resolve(
        Response.json({ id_token: "id-token", access_token: "access", token_type: "Bearer" }),
      );
    }),
  );
  jar.get.mockImplementation((name: string) => {
    const value = COOKIES[name];
    return value === undefined ? undefined : { name, value };
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("oidc callback infrastructure failure", () => {
  test("a database error during sign-in redirects to the login error page instead of a 500", async () => {
    upsert.mockRejectedValue(new Error("connection terminated unexpectedly"));
    const route = await loadRoute();
    const response = await route.GET(
      new NextRequest("https://app.example.com/auth/callback/oidc?code=code-1&state=state-1"),
    );
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("auth_failed");
    expect(console.error).toHaveBeenCalled();
  });
});
