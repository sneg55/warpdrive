// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { useLeadList } from "./useLeadList";

// Controllable pager shared with the trpc mock. Page 0 resolves immediately (200 rows of a
// 250-row result); the second page (offset 200) is deferred so the test can inspect the header
// counts WHILE the next-page fetch is still in flight.
const pager = vi.hoisted(() => {
  const rows = (start: number, count: number): { id: string }[] =>
    Array.from({ length: count }, (_v, i) => ({ id: String(start + i) }));
  let resolveSecond: (v: { rows: { id: string }[]; total: number }) => void = () => {};
  const second = new Promise<{ rows: { id: string }[]; total: number }>((res) => {
    resolveSecond = res;
  });
  // Page 0's shape is mutable so a test can shrink it between fetches, the way a delete elsewhere
  // in the app does. The first test relies on these defaults.
  const page0 = { count: 200, total: 250 };
  // The trailing page shifts too when a lead is deleted ahead of it, so it is mutable as well.
  const page2 = { count: 50 };
  return {
    page0,
    page2,
    // Each call resolves to a FRESH object, the way a real refetch does: react-query keeps the
    // previous data identity when a queryFn returns the very same object, which would hide a
    // refetch from the merge effect.
    fetchPage: (offset: number) =>
      offset === 0
        ? Promise.resolve({ rows: rows(0, page0.count), total: page0.total })
        : second.then(() => ({ rows: rows(200, page2.count), total: page0.total })),
    releaseSecondPage: () => resolveSecond({ rows: rows(200, 50), total: 250 }),
  };
});

// Delegate the trpc query to a REAL @tanstack/react-query useQuery so placeholderData semantics
// (keepPreviousData) are exercised end-to-end, not stubbed.
vi.mock("@/lib/trpc-client", async () => {
  const rq = await import("@tanstack/react-query");
  return {
    trpc: {
      useUtils: () => ({ lead: { list: { invalidate: () => Promise.resolve() } } }),
      lead: {
        list: {
          useQuery: (input: { offset: number }, opts?: object) =>
            rq.useQuery({
              queryKey: ["lead.list", input.offset],
              queryFn: () => pager.fetchPage(input.offset),
              ...opts,
            }),
        },
      },
    },
  };
});

function wrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const params = {
  filter: "inbox" as const,
  sort: { field: "createdAt" as const, dir: "desc" as const },
  ownerIds: [] as string[],
  labelKeys: [] as [],
  nextActivity: null,
  condition: null,
};

describe("useLeadList", () => {
  it("keeps total and canLoadMore stable while the next page is fetching", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useLeadList(params), { wrapper: wrapper(client) });

    // Wait on rows, not total: total reads straight off the query data while rows are merged one
    // render later by the effect, so waiting on total can observe the gap between the two and see
    // an empty rows array.
    await waitFor(() => expect(result.current.rows).toHaveLength(200));
    expect(result.current.total).toBe(250);
    expect(result.current.canLoadMore).toBe(true);

    act(() => {
      result.current.loadMore();
    });

    // Next page is in flight (deferred). Header count must NOT collapse to 0.
    await waitFor(() => expect(result.current.rows).toHaveLength(200));
    expect(result.current.total).toBe(250);
    expect(result.current.canLoadMore).toBe(true);

    // When the page arrives, its rows append exactly once (no dup of the previous page).
    act(() => {
      pager.releaseSecondPage();
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(250));
    expect(new Set(result.current.rows.map((r) => r.id)).size).toBe(250);
    expect(result.current.canLoadMore).toBe(false);
  });

  it("rewinds to the first page when an outside invalidate lands while paged past it", async () => {
    // Deleting a lead from its drawer invalidates lead.list from outside the hook. Past page one the
    // active query has a nonzero offset, so without a rewind the accumulated rows (deleted lead
    // included) would survive and clicking that row lands on Not found.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    pager.page0.count = 200;
    pager.page0.total = 250;
    const { result } = renderHook(() => useLeadList(params), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.rows).toHaveLength(200));
    act(() => {
      result.current.loadMore();
    });
    act(() => {
      pager.releaseSecondPage();
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(250));

    // A lead ahead of page two was deleted, so both the first page and the tail shift down by one.
    pager.page0.count = 199;
    pager.page0.total = 249;
    pager.page2.count = 49;
    await act(async () => {
      await client.invalidateQueries();
    });

    await waitFor(() => expect(result.current.rows).toHaveLength(199));
    expect(result.current.total).toBe(249);
  });

  it("drops a row that disappeared when the first page is refetched by an outside invalidate", async () => {
    // Deleting a lead from its drawer invalidates lead.list from outside this hook, so the hook
    // never gets to reset its own paging state. The refetched first page still has to land, or the
    // inbox keeps rendering a lead that no longer exists and clicking it lands on Not found.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    pager.page0.count = 3;
    pager.page0.total = 3;
    const { result } = renderHook(() => useLeadList(params), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.rows).toHaveLength(3));

    pager.page0.count = 2;
    pager.page0.total = 2;
    await act(async () => {
      await client.invalidateQueries();
    });

    await waitFor(() => expect(result.current.total).toBe(2));
    expect(result.current.rows).toHaveLength(2);
  });
});
