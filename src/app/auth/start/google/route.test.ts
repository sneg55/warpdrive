import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { env } from "@/config/env";

const jar = vi.hoisted(() => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }));
const providers = vi.hoisted(() => ({ google: true, oidc: false }));

vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(jar) }));
vi.mock("@/features/auth/enabledProviders", () => ({
  enabledSigninProviders: () => providers,
}));

import { GET } from "./route";

function startRequest(): NextRequest {
  return new NextRequest(`${env.BASE_URL}/auth/start/google?next=%2Fpipeline`);
}

beforeEach(() => {
  jar.set.mockClear();
});

describe("google sign-in start", () => {
  test("redirects to google and stores the login state when google sign-in is enabled", async () => {
    providers.google = true;
    const response = await GET(startRequest());
    expect(new URL(response.headers.get("location") ?? "").hostname).toBe("accounts.google.com");
    expect(jar.set).toHaveBeenCalled();
  });

  test("rejects without contacting google or storing state when google sign-in is disabled", async () => {
    providers.google = false;
    const response = await GET(startRequest());
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin).toBe(new URL(env.BASE_URL).origin);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("auth_failed");
    expect(jar.set).not.toHaveBeenCalled();
  });
});
