// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import type { UpdateResult } from "./updateAction";
import { useInlineEdit } from "./useInlineEdit";

vi.mock("./updateAction");

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

const liveKey = ["deal-list", "p1", "list", "none", "none"];
const otherPipelineKey = ["deal-list", "p2", "list", "none", "none"];

const seedData = {
  rows: [{ id: "a", title: "Old", value: "1.00" }],
  total: 1,
  totalValue: "1.00",
};

const twoRowSeed = {
  rows: [
    { id: "a", title: "OldA", value: "1.00" },
    { id: "b", title: "OldB", value: "2.00" },
  ],
  total: 2,
  totalValue: "3.00",
};

function readTitle(client: QueryClient, key: unknown[], rowIndex = 0): string {
  const data = client.getQueryData(key) as { rows: Array<{ title: string }> };
  return data.rows[rowIndex]!.title;
}

describe("useInlineEdit", () => {
  it("optimistically patches the live deal-list cache then reverts on error", async () => {
    const { promise, resolve } = deferred<UpdateResult>();
    const { updateDealAction } = await import("./updateAction");
    vi.mocked(updateDealAction).mockReturnValue(promise);

    const client = makeClient();
    client.setQueryData(liveKey, structuredClone(seedData));
    client.setQueryData(otherPipelineKey, structuredClone(seedData));

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
      expect(readTitle(client, liveKey)).toBe("New");
    });
    expect(readTitle(client, otherPipelineKey)).toBe("Old");

    resolve({ ok: false, error: { id: "E_DEAL_002" } });

    await waitFor(() => {
      expect(readTitle(client, liveKey)).toBe("Old");
    });
  });

  it("rolls back only the failed row, keeping a later overlapping edit intact", async () => {
    const first = deferred<UpdateResult>();
    const second = deferred<UpdateResult>();
    const { updateDealAction } = await import("./updateAction");
    vi.mocked(updateDealAction)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const client = makeClient();
    client.setQueryData(liveKey, structuredClone(twoRowSeed));

    const { result } = renderHook(() => useInlineEdit("p1"), { wrapper: wrapper(client) });

    act(() => {
      result.current.editCell({
        dealId: "a",
        field: "title",
        value: "NewA",
        expectedUpdatedAt: "2026-06-29T00:00:00.000Z",
      });
    });
    await waitFor(() => {
      expect(readTitle(client, liveKey, 0)).toBe("NewA");
    });

    act(() => {
      result.current.editCell({
        dealId: "b",
        field: "title",
        value: "NewB",
        expectedUpdatedAt: "2026-06-29T00:00:00.000Z",
      });
    });
    await waitFor(() => {
      expect(readTitle(client, liveKey, 1)).toBe("NewB");
    });

    first.resolve({ ok: false, error: { id: "E_DEAL_002" } });

    await waitFor(() => {
      expect(readTitle(client, liveKey, 0)).toBe("OldA");
    });
    expect(readTitle(client, liveKey, 1)).toBe("NewB");

    second.resolve({ ok: true, deal: { id: "b", updatedAt: "2026-06-29T00:00:01.000Z" } });
  });

  it("invalidates the deal-list queries for the pipeline on settled", async () => {
    const { updateDealAction } = await import("./updateAction");
    vi.mocked(updateDealAction).mockResolvedValue({ ok: false, error: { id: "E_DEAL_002" } });

    const client = makeClient();
    client.setQueryData(liveKey, structuredClone(seedData));

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
        expect.objectContaining({ queryKey: ["deal-list", "p1"] }),
      );
    });
  });
});
