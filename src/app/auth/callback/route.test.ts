import { NextRequest } from "next/server";
import { describe, expect, test } from "vitest";
import { env } from "@/config/env";
import { GET } from "./route";

function redirectLocation(requestUrl: string): URL {
  const response = GET(new NextRequest(requestUrl));
  return new URL(response.headers.get("location") ?? "");
}

describe("auth callback shim", () => {
  test("redirects to the canonical base url instead of the server listen address", () => {
    const location = redirectLocation("http://0.0.0.0:3000/auth/callback");

    expect(location.origin).toBe(new URL(env.BASE_URL).origin);
    expect(location.pathname).toBe("/auth/callback/google");
  });

  test("preserves the authorization code and state on the redirect", () => {
    const location = redirectLocation(
      "http://0.0.0.0:3000/auth/callback?code=code-1&state=state-1",
    );

    expect(location.searchParams.get("code")).toBe("code-1");
    expect(location.searchParams.get("state")).toBe("state-1");
  });
});
