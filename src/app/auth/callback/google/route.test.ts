import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { env } from "@/config/env";

const COOKIES: Record<string, string> = {
  wd_oauth_state: "state-1",
  wd_oauth_nonce: "nonce-1",
  wd_oauth_pkce_verifier: "verifier-1",
};

const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }));
const providers = vi.hoisted(() => ({ google: true, oidc: false }));

vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(jar) }));
vi.mock("@/features/auth/enabledProviders", () => ({
  enabledSigninProviders: () => providers,
}));

import { GET } from "./route";

const tokenFetch = vi.fn();

function callbackRequest(): NextRequest {
  return new NextRequest(`${env.BASE_URL}/auth/callback/google?code=code-1&state=state-1`);
}

beforeEach(() => {
  tokenFetch.mockReset();
  tokenFetch.mockResolvedValue(new Response("{}", { status: 400 }));
  vi.stubGlobal("fetch", tokenFetch);
  jar.get.mockImplementation((name: string) => {
    const value = COOKIES[name];
    return value === undefined ? undefined : { name, value };
  });
  jar.delete.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("google sign-in callback", () => {
  test("exchanges the code with google when google sign-in is enabled", async () => {
    providers.google = true;
    await GET(callbackRequest());
    expect(tokenFetch).toHaveBeenCalledTimes(1);
  });

  test("rejects before any token exchange when google sign-in is disabled", async () => {
    providers.google = false;
    const response = await GET(callbackRequest());
    expect(tokenFetch).not.toHaveBeenCalled();
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("auth_failed");
  });
});
