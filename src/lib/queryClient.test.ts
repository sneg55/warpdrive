import { describe, expect, it } from "vitest";
import { QUERY_STALE_TIME_MS } from "@/constants/query";
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
});
