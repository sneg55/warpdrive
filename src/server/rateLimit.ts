const DEFAULT_MAX_KEYS = 10_000;

interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  maxKeys?: number;
}

export interface RateLimitResult {
  allowed: boolean;
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

  function evictExpired(now: number): void {
    for (const [key, window] of windows) {
      if (now - window.startedAt >= windowMs) windows.delete(key);
    }
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

export function clientKeyFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded === null) return SHARED_BUCKET;
  const entries = forwarded
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  return entries.at(-1) ?? SHARED_BUCKET;
}
