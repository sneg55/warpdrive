// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import type { UpdateResult } from "./updateAction";
import { useInlineEdit } from "./useInlineEdit";

vi.mock("./updateAction");

// Helper: deferred promise so tests can assert optimistic state before settling.
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const seedData = {
  rows: [{ id: "a", title: "Old", value: "1.00" }],
  total: 1,
  totalValue: "1.00",
};

describe("useInlineEdit", () => {
  it("optimistically edits a cell then reverts on error", async () => {
    const { promise, resolve } = deferred<UpdateResult>();
    const { updateDealAction } = await import("./updateAction");
    vi.mocked(updateDealAction).mockReturnValue(promise);

    const client = makeClient();
    client.setQueryData(["deals", "p1"], structuredClone(seedData));

    const { result } = renderHook(() => useInlineEdit("p1"), { wrapper: wrapper(client) });

    act(() => {
      result.current.editCell({
        dealId: "a",
        field: "title",
        value: "New",
        expectedUpdatedAt: "2026-06-29T00:00:00.000Z",
      });
    });

    // Optimistic patch should land before the mutation resolves.
    await waitFor(() => {
      const data = client.getQueryData(["deals", "p1"]) as { rows: Array<{ title: string }> };
      expect(data.rows[0]!.title).toBe("New");
    });

    // Settle with ok:false (stale precondition): cache must revert.
    resolve({ ok: false, error: { id: "E_DEAL_002" } });

    await waitFor(() => {
      const data = client.getQueryData(["deals", "p1"]) as { rows: Array<{ title: string }> };
      expect(data.rows[0]!.title).toBe("Old");
    });
  });

  it("invalidates the deals query on settled", async () => {
    const { updateDealAction } = await import("./updateAction");
    vi.mocked(updateDealAction).mockResolvedValue({ ok: false, error: { id: "E_DEAL_002" } });

    const client = makeClient();
    client.setQueryData(["deals", "p1"], structuredClone(seedData));

    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useInlineEdit("p1"), { wrapper: wrapper(client) });

    act(() => {
      result.current.editCell({
        dealId: "a",
        field: "title",
        value: "New",
        expectedUpdatedAt: "2026-06-29T00:00:00.000Z",
      });
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["deals", "p1"] }),
      );
    });
  });
});
