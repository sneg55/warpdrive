import { NextRequest } from "next/server";
import { describe, expect, test } from "vitest";
import { env } from "@/config/env";
import { GET } from "./route";

function redirectLocation(requestUrl: string): URL {
  const response = GET(new NextRequest(requestUrl));
  return new URL(response.headers.get("location") ?? "");
}

describe("auth start shim", () => {
  test("redirects to the canonical base url instead of the server listen address", () => {
    const location = redirectLocation("http://0.0.0.0:3000/auth/start");

    expect(location.origin).toBe(new URL(env.BASE_URL).origin);
    expect(location.pathname).toBe("/auth/start/google");
  });

  test("preserves the login return query on the redirect", () => {
    const location = redirectLocation("http://0.0.0.0:3000/auth/start?next=%2Fpipeline");

    expect(location.searchParams.get("next")).toBe("/pipeline");
  });
});
