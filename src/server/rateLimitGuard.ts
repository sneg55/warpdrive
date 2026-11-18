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

export function tooManyRequestsResponse(result: RateLimitResult): Response {
  return new Response("Too many requests", {
    status: 429,
    headers: {
      "retry-after": String(Math.max(1, result.retryAfterSeconds)),
      "cache-control": "no-store",
    },
  });
}

export function resetRateLimitsForTest(): void {
  registry().clear();
}
