import { describe, expect, it } from "vitest";
import { QUERY_GC_TIME_MS, QUERY_STALE_TIME_MS } from "@/constants/query";
import { makeQueryClient } from "./queryClient";

// Every tRPC read went through a bare `new QueryClient()`, which defaults to staleTime 0 and
// refetchOnWindowFocus true. Alt-tabbing back into the app refetched every mounted query.
describe("makeQueryClient", () => {
  it("gives queries a non-zero staleTime so a remount does not refetch immediately", () => {
    const queries = makeQueryClient().getDefaultOptions().queries;
    expect(queries?.staleTime).toBe(QUERY_STALE_TIME_MS);
    expect(QUERY_STALE_TIME_MS).toBeGreaterThan(0);
  });

  it("does not refetch every mounted query when the window regains focus", () => {
    const queries = makeQueryClient().getDefaultOptions().queries;
    expect(queries?.refetchOnWindowFocus).toBe(false);
  });

  it("returns a fresh client per call so each request gets its own cache", () => {
    expect(makeQueryClient()).not.toBe(makeQueryClient());
  });

  // Back-navigation should hit cache: an unmounted section's data must survive well past the stale
  // window so returning to it paints instantly (then refetches in the background) instead of cold.
  it("keeps unused query data cached (gcTime) longer than the stale window", () => {
    const queries = makeQueryClient().getDefaultOptions().queries;
    expect(queries?.gcTime).toBe(QUERY_GC_TIME_MS);
    expect(QUERY_GC_TIME_MS).toBeGreaterThan(QUERY_STALE_TIME_MS);
  });

  // Guard against regressing to a no-op: TanStack Query already defaults gcTime to 5 minutes, so a
  // value at or below that would not widen retention at all (the back-nav win would be illusory).
  it("widens gcTime beyond TanStack's 5-minute default", () => {
    const TANSTACK_DEFAULT_GC_TIME_MS = 5 * 60_000;
    expect(QUERY_GC_TIME_MS).toBeGreaterThan(TANSTACK_DEFAULT_GC_TIME_MS);
  });
});
