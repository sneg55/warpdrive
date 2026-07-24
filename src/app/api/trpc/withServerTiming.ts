// Wraps the tRPC fetch handler so every HTTP response carries a `Server-Timing` header. A perf
// baseline harness reads this to attribute server wall-clock time per request. Kept as a pure,
// DB-free function so it can be unit-tested without spinning up the real router or Postgres.

/**
 * Measure the inner handler's wall-clock duration with `performance.now()` (monotonic, unaffected
 * by clock drift, unlike `Date.now()`) and append `Server-Timing: trpc;dur=<ms>` to the response.
 *
 * The fetch adapter returns a Response for expected tRPC errors rather than throwing, so the normal
 * Response path is the only one that needs the header. A genuine throw (programmer error) is left to
 * propagate untouched: we do not swallow it and we do not annotate a response we never produced.
 */
export function withServerTiming(
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const start = performance.now();
    const res = await handler(req);
    const durMs = Math.round((performance.now() - start) * 10) / 10;

    // Clone existing headers so the original response is left intact, then append our metric.
    const headers = new Headers(res.headers);
    headers.set("Server-Timing", `trpc;dur=${durMs}`);

    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
