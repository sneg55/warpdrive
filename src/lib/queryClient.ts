import { QueryClient } from "@tanstack/react-query";
import { QUERY_STALE_TIME_MS } from "@/constants/query";

/**
 * The app's TanStack Query client.
 *
 * A bare `new QueryClient()` defaults to `staleTime: 0` and `refetchOnWindowFocus: true`, so
 * every mounted query refetched whenever the tab regained focus. Reads here are invalidated
 * explicitly by the mutations that change them, so a short freshness window is safe.
 * Individual queries still override `staleTime` where they need tighter bounds (e.g. the board).
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: QUERY_STALE_TIME_MS,
        refetchOnWindowFocus: false,
      },
    },
  });
}
