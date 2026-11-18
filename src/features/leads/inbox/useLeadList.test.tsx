// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { useLeadList } from "./useLeadList";

const pager = vi.hoisted(() => {
  type RefLabels = {
    user: Record<string, string>;
    person: Record<string, string>;
    org: Record<string, string>;
  };
  type Page = { rows: { id: string }[]; total: number; refLabels: RefLabels };
  const rows = (start: number, count: number): { id: string }[] =>
    Array.from({ length: count }, (_v, i) => ({ id: String(start + i) }));
  let resolveSecond: (v: Page) => void = () => {};
  const second = new Promise<Page>((res) => {
    resolveSecond = res;
  });
  const page0 = { count: 200, total: 250 };
  const page2 = { count: 50 };
  const page0RefLabels: RefLabels = { user: { u1: "Ada" }, person: {}, org: {} };
  const page2RefLabels: RefLabels = { user: { u2: "Bea" }, person: {}, org: {} };
  return {
    page0,
    page2,
    page0RefLabels,
    page2RefLabels,
    fetchPage: (offset: number) =>
      offset === 0
        ? Promise.resolve({
            rows: rows(0, page0.count),
            total: page0.total,
            refLabels: page0RefLabels,
          })
        : second.then(() => ({
            rows: rows(200, page2.count),
            total: page0.total,
            refLabels: page2RefLabels,
          })),
    releaseSecondPage: () =>
      resolveSecond({ rows: rows(200, 50), total: 250, refLabels: page2RefLabels }),
  };
});

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

    await waitFor(() => expect(result.current.rows).toHaveLength(200));
    expect(result.current.total).toBe(250);
    expect(result.current.canLoadMore).toBe(true);

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => expect(result.current.rows).toHaveLength(200));
    expect(result.current.total).toBe(250);
    expect(result.current.canLoadMore).toBe(true);

    act(() => {
      pager.releaseSecondPage();
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(250));
    expect(new Set(result.current.rows.map((r) => r.id)).size).toBe(250);
    expect(result.current.canLoadMore).toBe(false);
  });

  it("rewinds to the first page when an outside invalidate lands while paged past it", async () => {
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

  it("merges refLabels across pages and resets them on refetch", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    pager.page0.count = 200;
    pager.page0.total = 250;
    pager.page2.count = 50;
    const { result } = renderHook(() => useLeadList(params), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.rows).toHaveLength(200));
    expect(result.current.refLabels).toEqual(pager.page0RefLabels);

    act(() => {
      result.current.loadMore();
    });
    act(() => {
      pager.releaseSecondPage();
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(250));
    expect(result.current.refLabels).toEqual({
      user: { ...pager.page0RefLabels.user, ...pager.page2RefLabels.user },
      person: {},
      org: {},
    });

    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(200));
    expect(result.current.refLabels).toEqual(pager.page0RefLabels);
  });
});
