export function withServerTiming(
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const start = performance.now();
    const res = await handler(req);
    const durMs = Math.round((performance.now() - start) * 10) / 10;

    const headers = new Headers(res.headers);
    headers.set("Server-Timing", `trpc;dur=${durMs}`);

    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
