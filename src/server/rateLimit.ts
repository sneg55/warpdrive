/**
 * Fixed-window rate limiter for the unauthenticated edge.
 *
 * Scope, stated plainly: this is per-process, in-memory state. The deploy topology is a single
 * box (one `app` container behind Caddy, see docker-compose.yml), so one process sees all the
 * traffic and that is sufficient. It is NOT correct across replicas: if this app is ever scaled
 * horizontally, each replica enforces its own allowance and the effective limit multiplies by
 * the replica count. Moving to a shared store is the fix at that point, not raising the numbers.
 *
 * Fixed window rather than a token bucket because the failure it defends against is sustained
 * hammering, not burst smoothing, and a window is trivially auditable: the reset moment is
 * `windowStart + windowMs` and nothing else influences it.
 */

// Guards the limiter's own memory. Keys derive from client IPs, so this is only reachable under
// a distributed flood, but the thing that stops a memory exhaustion attack must not be a memory
// exhaustion attack.
const DEFAULT_MAX_KEYS = 10_000;

interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  maxKeys?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  // Seconds until the current window resets. 0 when the request was allowed.
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string, now: number): RateLimitResult;
  size(): number;
}

interface Window {
  count: number;
  startedAt: number;
}

export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { limit, windowMs, maxKeys = DEFAULT_MAX_KEYS } = opts;
  const windows = new Map<string, Window>();

  // Drop every window that has already rolled over. Called only when the map is at its cap, so
  // the common path stays a single Map lookup.
  function evictExpired(now: number): void {
    for (const [key, window] of windows) {
      if (now - window.startedAt >= windowMs) windows.delete(key);
    }
    // Still full after dropping the expired ones: a genuine distributed flood. Clear outright
    // rather than let the map grow. This briefly forgives in-flight offenders, which is the
    // right trade against unbounded growth.
    if (windows.size >= maxKeys) windows.clear();
  }

  return {
    check(key: string, now: number): RateLimitResult {
      const existing = windows.get(key);
      if (existing === undefined || now - existing.startedAt >= windowMs) {
        if (windows.size >= maxKeys) evictExpired(now);
        windows.set(key, { count: 1, startedAt: now });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      if (existing.count >= limit) {
        const remainingMs = existing.startedAt + windowMs - now;
        return { allowed: false, retryAfterSeconds: Math.ceil(remainingMs / 1_000) };
      }
      existing.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
    size(): number {
      return windows.size;
    },
  };
}

const SHARED_BUCKET = "unknown";

/**
 * Derive the rate-limit key from a request's forwarded-for chain.
 *
 * Reads the LAST entry, not the first. Caddy APPENDS the real peer address to whatever
 * X-Forwarded-For the client sent (see Caddyfile), so the final entry is the only one the proxy
 * vouches for and every earlier entry is attacker-written. Taking the first entry, which is the
 * common reading of "the client IP", would let a single attacker present a fresh fake address on
 * every request and never be limited at all: the limiter would look like it was working while
 * enforcing nothing.
 *
 * TRUST ASSUMPTION, stated so it is not discovered the hard way: this is only sound when the app
 * is reachable ONLY through a proxy that appends the peer address, which is what the shipped
 * topology does (Caddy is the sole public listener; the app container publishes no host port).
 * Expose the app port directly and X-Forwarded-For becomes entirely caller-written, at which
 * point every request can claim a fresh key and these limits enforce nothing.
 */
export function clientKeyFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded === null) return SHARED_BUCKET;
  const entries = forwarded
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  return entries.at(-1) ?? SHARED_BUCKET;
}
