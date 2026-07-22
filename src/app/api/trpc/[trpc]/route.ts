import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { captureServerError } from "@/features/observability/server";
import { createContext } from "@/server/trpc/context";
import { appRouter } from "@/server/trpc/root";

const EXPECTED = new Set([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "BAD_REQUEST",
  "NOT_FOUND",
  "TIMEOUT",
  "CONFLICT",
  "TOO_MANY_REQUESTS",
  "PARSE_ERROR",
]);

function handler(req: Request): Promise<Response> {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext,
    onError: ({ error, ctx, path }) => {
      if (!EXPECTED.has(error.code)) {
        captureServerError(ctx?.actor?.id ?? null, error, { path: path ?? "", route: "trpc" });
      }
    },
  });
}

export { handler as GET, handler as POST };
