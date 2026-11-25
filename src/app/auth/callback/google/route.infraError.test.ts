import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { env } from "@/config/env";

const COOKIES: Record<string, string> = {
  wd_oauth_state: "state-1",
  wd_oauth_nonce: "nonce-1",
  wd_oauth_pkce_verifier: "verifier-1",
};

const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }));
const upsert = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(jar) }));
vi.mock("@/features/auth/enabledProviders", () => ({
  enabledSigninProviders: () => ({ google: true, oidc: false }),
}));
vi.mock("@/features/auth/verifyGoogleIdToken", () => ({
  verifyGoogleIdToken: () =>
    Promise.resolve({
      ok: true,
      value: { email: "a@example.com", sub: "g-1", name: "A", avatarUrl: null },
    }),
}));
vi.mock("@/features/auth/bootstrap", () => ({ upsertUserOnLogin: upsert }));

import { GET } from "./route";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        Response.json({ id_token: "id-token", access_token: "access", token_type: "Bearer" }),
      ),
    ),
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
  vi.restoreAllMocks();
});

describe("google callback infrastructure failure", () => {
  test("a database error during sign-in redirects to the login error page instead of a 500", async () => {
    upsert.mockRejectedValue(new Error("connection terminated unexpectedly"));
    const response = await GET(
      new NextRequest(`${env.BASE_URL}/auth/callback/google?code=code-1&state=state-1`),
    );
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("auth_failed");
    expect(console.error).toHaveBeenCalled();
  });
});
