/**
 * The per-endpoint limiter registry that route handlers call.
 *
 * Lives on globalThis rather than in a module-level `let`. Next bundles server code into several
 * layers, and a module-scoped singleton can end up instantiated once per layer, which would give
 * each layer its own private allowance and quietly multiply every limit. This repo has already
 * been bitten by exactly that shape once (the pg-boss producer could not see the boss instance
 * for the same reason), so the limiter is pinned to one place all layers agree on.
 */

import { RATE_LIMITS, type RateLimitName } from "@/constants/rateLimits";
import type { RateLimitResult } from "./rateLimit";
import { clientKeyFromHeaders, createRateLimiter, type RateLimiter } from "./rateLimit";

const REGISTRY_KEY = Symbol.for("warpdrive.rateLimiters");

type Registry = Map<RateLimitName, RateLimiter>;

function registry(): Registry {
  const holder = globalThis as { [REGISTRY_KEY]?: Registry };
  holder[REGISTRY_KEY] ??= new Map();
  return holder[REGISTRY_KEY];
}

function limiterFor(name: RateLimitName): RateLimiter {
  const map = registry();
  const existing = map.get(name);
  if (existing !== undefined) return existing;
  const created = createRateLimiter(RATE_LIMITS[name]);
  map.set(name, created);
  return created;
}

export function checkRateLimit(name: RateLimitName, headers: Headers): RateLimitResult {
  return limiterFor(name).check(clientKeyFromHeaders(headers), Date.now());
}

// A Retry-After of 0 reads as "try again now", which is the opposite of the instruction, so the
// floor is one second even when the window is about to roll over anyway.
export function tooManyRequestsResponse(result: RateLimitResult): Response {
  return new Response("Too many requests", {
    status: 429,
    headers: {
      "retry-after": String(Math.max(1, result.retryAfterSeconds)),
      "cache-control": "no-store",
    },
  });
}

// Test seam: the registry is process-global by design, so tests that exhaust an allowance would
// otherwise leak that state into every later test in the same worker.
export function resetRateLimitsForTest(): void {
  registry().clear();
}
