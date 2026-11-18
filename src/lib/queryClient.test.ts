import { describe, expect, it } from "vitest";
import { QUERY_GC_TIME_MS, QUERY_STALE_TIME_MS } from "@/constants/query";
import { makeQueryClient } from "./queryClient";

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

  it("keeps unused query data cached (gcTime) longer than the stale window", () => {
    const queries = makeQueryClient().getDefaultOptions().queries;
    expect(queries?.gcTime).toBe(QUERY_GC_TIME_MS);
    expect(QUERY_GC_TIME_MS).toBeGreaterThan(QUERY_STALE_TIME_MS);
  });

  it("widens gcTime beyond TanStack's 5-minute default", () => {
    const TANSTACK_DEFAULT_GC_TIME_MS = 5 * 60_000;
    expect(QUERY_GC_TIME_MS).toBeGreaterThan(TANSTACK_DEFAULT_GC_TIME_MS);
  });
});
