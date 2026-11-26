import type { ServerTimingEvent } from "@/features/observability/server";
import { requestsNoTracking } from "@/features/observability/serverTimingPrivacy";

const TRPC_PATH_PREFIX = "/api/trpc/";
const UNKNOWN_PROCEDURE = "unknown";

interface TimingReporting {
  report: (event: ServerTimingEvent) => void;
  isKnownProcedure: (path: string) => boolean;
  enabled: () => boolean;
}

const HEADER_ONLY: TimingReporting = {
  report: () => {},
  isKnownProcedure: () => false,
  enabled: () => false,
};

function decodedOrNull(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function procedureLabel(req: Request, isKnownProcedure: (path: string) => boolean): string {
  const url = new URL(req.url);
  if (!url.pathname.startsWith(TRPC_PATH_PREFIX)) return UNKNOWN_PROCEDURE;
  const decoded = decodedOrNull(url.pathname.slice(TRPC_PATH_PREFIX.length));
  if (decoded === null) return UNKNOWN_PROCEDURE;
  const paths = url.searchParams.get("batch") === "1" ? decoded.split(",") : [decoded];
  return paths.map((path) => (isKnownProcedure(path) ? path : UNKNOWN_PROCEDURE)).join(",");
}

export function withServerTiming(
  handler: (req: Request) => Promise<Response>,
  reporting: TimingReporting = HEADER_ONLY,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const start = performance.now();
    const res = await handler(req);
    const durMs = Math.round((performance.now() - start) * 10) / 10;

    if (reporting.enabled() && !requestsNoTracking(req.headers)) {
      reporting.report({
        kind: "trpc",
        total_ms: durMs,
        spans: {
          [procedureLabel(req, reporting.isKnownProcedure)]: { start_ms: 0, dur_ms: durMs },
        },
      });
    }

    const headers = new Headers(res.headers);
    headers.set("Server-Timing", `trpc;dur=${durMs}`);

    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
