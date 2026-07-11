// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import type { BoardData } from "./boardCache";
import { midpoint } from "./boardPosition";
import type { MoveResult } from "./moveAction";
import { useDealMove } from "./useDealMove";

vi.mock("./moveAction");

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

const baseCard = {
  id: "a",
  title: "a",
  value: null,
  stageId: "s1",
  boardPosition: "1",
  ownerId: "u",
  personId: null,
  orgId: null,
  nextActivityAt: null,
  lastActivityAt: null,
  stageEnteredAt: new Date(),
  updatedAt: new Date(),
} as const;

describe("useDealMove", () => {
  it("optimistically patches the cache before the mutation settles", async () => {
    const { promise, resolve } = deferred<MoveResult>();
    const { moveDealAction } = await import("./moveAction");
    vi.mocked(moveDealAction).mockReturnValue(promise);

    const client = makeClient();
    const initial: BoardData = { cards: [{ ...baseCard }] };
    client.setQueryData(["board", "p1"], initial);

    const { result } = renderHook(() => useDealMove("p1"), { wrapper: wrapper(client) });

    act(() => {
      result.current.move({
        dealId: "a",
        toStageId: "s2",
        beforePosition: null,
        afterPosition: null,
        expectedUpdatedAt: "2026-06-29T00:00:00.000Z",
      });
    });

    // onMutate is async (cancelQueries), so wait for the optimistic patch to land.
    await waitFor(() => {
      expect((client.getQueryData(["board", "p1"]) as BoardData).cards[0]!.stageId).toBe("s2");
    });

    // Now settle with a stale-precondition error: cache should roll back to s1.
    resolve({ ok: false, error: { id: "E_DEAL_002" } });

    await waitFor(() => {
      expect((client.getQueryData(["board", "p1"]) as BoardData).cards[0]!.stageId).toBe("s1");
    });

    // sanity: midpoint helper imported correctly
    expect(midpoint(null, null)).toBe("1");
  });

  it("invalidates the board query on settled", async () => {
    const { moveDealAction } = await import("./moveAction");
    vi.mocked(moveDealAction).mockResolvedValue({ ok: false, error: { id: "E_DEAL_002" } });

    const client = makeClient();
    client.setQueryData(["board", "p1"], { cards: [] } satisfies BoardData);
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useDealMove("p1"), { wrapper: wrapper(client) });

    act(() => {
      result.current.move({
        dealId: "x",
        toStageId: "s2",
        beforePosition: null,
        afterPosition: null,
        expectedUpdatedAt: "2026-06-29T00:00:00.000Z",
      });
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["board", "p1"] }),
      );
    });
  });
});
