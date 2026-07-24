import { describe, expect, test } from "vitest";
import { clientKeyFromHeaders, createRateLimiter } from "./rateLimit";

// Every one of these endpoints is reachable without a session and costs a database round trip:
// /oauth/register writes a row, /oauth/token reads and writes, the tracking pixel does both on
// every email open, /api/health queries. Before this there was no bound of any kind on how fast
// a stranger could drive them.

describe("createRateLimiter", () => {
  test("allows requests up to the limit inside one window", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 1_000 });
    expect(limiter.check("ip", 0).allowed).toBe(true);
    expect(limiter.check("ip", 10).allowed).toBe(true);
    expect(limiter.check("ip", 20).allowed).toBe(true);
  });

  test("blocks the request past the limit", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1_000 });
    limiter.check("ip", 0);
    limiter.check("ip", 0);
    expect(limiter.check("ip", 0).allowed).toBe(false);
  });

  test("reports how long to wait, for the Retry-After header", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    limiter.check("ip", 0);
    expect(limiter.check("ip", 15_000).retryAfterSeconds).toBe(45);
  });

  test("lets the caller back in once the window rolls over", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000 });
    expect(limiter.check("ip", 0).allowed).toBe(true);
    expect(limiter.check("ip", 500).allowed).toBe(false);
    expect(limiter.check("ip", 1_000).allowed).toBe(true);
  });

  test("counts each key separately so one abuser cannot lock everyone out", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000 });
    expect(limiter.check("abuser", 0).allowed).toBe(true);
    expect(limiter.check("abuser", 0).allowed).toBe(false);
    expect(limiter.check("everyone-else", 0).allowed).toBe(true);
  });

  // The limiter's own state is attacker-influenced, so it must not become the memory leak it
  // exists to prevent.
  test("evicts stale keys instead of growing without bound", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000, maxKeys: 10 });
    for (let i = 0; i < 5_000; i++) limiter.check(`ip-${i}`, i);
    expect(limiter.size()).toBeLessThanOrEqual(10);
  });
});

describe("clientKeyFromHeaders", () => {
  // Caddy APPENDS the real peer address to any X-Forwarded-For the client supplied. So the
  // LAST entry is the one the proxy vouches for and every earlier entry is attacker-written.
  // Reading the first entry (the usual mistake) would let one attacker present a fresh fake IP
  // per request and never be limited at all.
  test("takes the last forwarded-for entry, which is the one the proxy appended", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" });
    expect(clientKeyFromHeaders(headers)).toBe("203.0.113.9");
  });

  test("ignores a spoofed entry even when the client sends many", () => {
    const spoofed = new Headers({ "x-forwarded-for": "9.9.9.9, 8.8.8.8, 203.0.113.9" });
    const single = new Headers({ "x-forwarded-for": "203.0.113.9" });
    expect(clientKeyFromHeaders(spoofed)).toBe(clientKeyFromHeaders(single));
  });

  test("handles a single forwarded-for entry", () => {
    expect(clientKeyFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.9" }))).toBe(
      "203.0.113.9",
    );
  });

  // Better to lump unattributable traffic into one shared bucket than to hand every such
  // request its own unlimited allowance.
  test("falls back to a single shared bucket when no forwarded-for is present", () => {
    expect(clientKeyFromHeaders(new Headers())).toBe("unknown");
  });

  test("falls back when forwarded-for is present but empty", () => {
    expect(clientKeyFromHeaders(new Headers({ "x-forwarded-for": "  " }))).toBe("unknown");
  });
});
