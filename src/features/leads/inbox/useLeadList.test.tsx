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
  return {
    fetchPage: (offset: number) =>
      offset === 0 ? Promise.resolve({ rows: rows(0, 200), total: 250 }) : second,
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

    await waitFor(() => expect(result.current.total).toBe(250));
    expect(result.current.rows).toHaveLength(200);
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
});
