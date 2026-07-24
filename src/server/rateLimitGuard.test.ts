import { describe, expect, test } from "vitest";
import { RATE_LIMITS } from "@/constants/rateLimits";
import { checkRateLimit, resetRateLimitsForTest, tooManyRequestsResponse } from "./rateLimitGuard";

function headersFor(ip: string): Headers {
  return new Headers({ "x-forwarded-for": ip });
}

describe("checkRateLimit", () => {
  test("allows traffic under the configured allowance", () => {
    resetRateLimitsForTest();
    expect(checkRateLimit("oauthRegister", headersFor("1.1.1.1")).allowed).toBe(true);
  });

  test("blocks once an address exhausts its allowance", () => {
    resetRateLimitsForTest();
    const headers = headersFor("2.2.2.2");
    for (let i = 0; i < RATE_LIMITS.oauthRegister.limit; i++) {
      expect(checkRateLimit("oauthRegister", headers).allowed).toBe(true);
    }
    expect(checkRateLimit("oauthRegister", headers).allowed).toBe(false);
  });

  test("keeps a separate allowance per endpoint", () => {
    resetRateLimitsForTest();
    const headers = headersFor("3.3.3.3");
    for (let i = 0; i < RATE_LIMITS.oauthRegister.limit; i++) {
      checkRateLimit("oauthRegister", headers);
    }
    // Exhausting registration must not lock the same caller out of the token endpoint.
    expect(checkRateLimit("oauthToken", headers).allowed).toBe(true);
  });

  test("does not let one address consume another's allowance", () => {
    resetRateLimitsForTest();
    for (let i = 0; i < RATE_LIMITS.oauthRegister.limit; i++) {
      checkRateLimit("oauthRegister", headersFor("4.4.4.4"));
    }
    expect(checkRateLimit("oauthRegister", headersFor("5.5.5.5")).allowed).toBe(true);
  });

  // The proxy appends the true peer, so a forged prefix must not create a fresh allowance.
  test("cannot be reset by prepending a spoofed forwarded-for entry", () => {
    resetRateLimitsForTest();
    for (let i = 0; i < RATE_LIMITS.oauthRegister.limit; i++) {
      checkRateLimit("oauthRegister", headersFor("6.6.6.6"));
    }
    const spoofed = new Headers({ "x-forwarded-for": "9.9.9.9, 6.6.6.6" });
    expect(checkRateLimit("oauthRegister", spoofed).allowed).toBe(false);
  });
});

describe("tooManyRequestsResponse", () => {
  test("responds 429", () => {
    expect(tooManyRequestsResponse({ allowed: false, retryAfterSeconds: 30 }).status).toBe(429);
  });

  test("tells the caller when to come back", () => {
    const res = tooManyRequestsResponse({ allowed: false, retryAfterSeconds: 30 });
    expect(res.headers.get("retry-after")).toBe("30");
  });

  test("never advertises a zero-second wait, which reads as retry immediately", () => {
    const res = tooManyRequestsResponse({ allowed: false, retryAfterSeconds: 0 });
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
