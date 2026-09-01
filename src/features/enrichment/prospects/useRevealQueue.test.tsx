// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PROSPECT_REVEAL_CHUNK } from "@/constants/prospectSearch";
import { useRevealQueue } from "./useRevealQueue";

function profiles(count: number): { providerRef: string }[] {
  return Array.from({ length: count }, (_, i) => ({ providerRef: `p${i}` }));
}

function revealed(chunk: { providerRef: string }[]): { providerRef: string; value: string }[] {
  return chunk.map((p) => ({ providerRef: p.providerRef, value: `v-${p.providerRef}` }));
}

describe("useRevealQueue", () => {
  it("starts idle with nothing processed", () => {
    const { result } = renderHook(() => useRevealQueue({ send: vi.fn() }));
    expect(result.current.status).toBe("idle");
    expect(result.current.processed).toBe(0);
    expect(result.current.results).toEqual([]);
  });

  it("sends no more than one chunk size per call", async () => {
    const send = vi.fn((chunk: { providerRef: string }[]) => Promise.resolve(revealed(chunk)));
    const { result } = renderHook(() => useRevealQueue({ send }));
    act(() => {
      result.current.start(profiles(PROSPECT_REVEAL_CHUNK + 2));
    });
    await waitFor(() => {
      expect(result.current.status).toBe("done");
    });
    for (const call of send.mock.calls) {
      expect(call[0].length).toBeLessThanOrEqual(PROSPECT_REVEAL_CHUNK);
    }
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("reports progress against the total after each chunk", async () => {
    const total = PROSPECT_REVEAL_CHUNK * 2;
    const send = vi.fn((chunk: { providerRef: string }[]) => Promise.resolve(revealed(chunk)));
    const { result } = renderHook(() => useRevealQueue({ send }));
    act(() => {
      result.current.start(profiles(total));
    });
    await waitFor(() => {
      expect(result.current.status).toBe("done");
    });
    expect(result.current.total).toBe(total);
    expect(result.current.processed).toBe(total);
    expect(result.current.results).toHaveLength(total);
  });

  it("never runs two chunks at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const send = async (chunk: { providerRef: string }[]) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return revealed(chunk);
    };
    const { result } = renderHook(() => useRevealQueue({ send }));
    act(() => {
      result.current.start(profiles(PROSPECT_REVEAL_CHUNK * 3));
    });
    await waitFor(() => {
      expect(result.current.status).toBe("done");
    });
    expect(maxInFlight).toBe(1);
  });

  it("stops on a rejected chunk and surfaces the error instead of ending quietly", async () => {
    const send = vi
      .fn<(chunk: { providerRef: string }[]) => Promise<{ providerRef: string; value: string }[]>>()
      .mockImplementationOnce((chunk) => Promise.resolve(revealed(chunk)))
      .mockImplementationOnce(() => Promise.reject(new Error("provider down")));
    const { result } = renderHook(() => useRevealQueue({ send }));
    act(() => {
      result.current.start(profiles(PROSPECT_REVEAL_CHUNK * 3));
    });
    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current.error).toBe("provider down");
    expect(send).toHaveBeenCalledTimes(2);
    expect(result.current.results).toHaveLength(PROSPECT_REVEAL_CHUNK);
  });

  it("keeps the chunk that was already in flight when the user stops", async () => {
    const gates: (() => void)[] = [];
    const send = (chunk: { providerRef: string }[]) =>
      new Promise<{ providerRef: string; value: string }[]>((resolve) => {
        gates.push(() => {
          resolve(revealed(chunk));
        });
      });
    const { result } = renderHook(() => useRevealQueue({ send }));
    act(() => {
      result.current.start(profiles(PROSPECT_REVEAL_CHUNK * 4));
    });
    await waitFor(() => {
      expect(gates).toHaveLength(1);
    });
    await act(async () => {
      gates[0]?.();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current.processed).toBe(PROSPECT_REVEAL_CHUNK);
    });
    act(() => {
      result.current.abort();
    });
    await waitFor(() => {
      expect(gates).toHaveLength(2);
    });
    await act(async () => {
      gates[1]?.();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current.status).toBe("aborted");
    });
    expect(result.current.results).toHaveLength(PROSPECT_REVEAL_CHUNK * 2);
    expect(result.current.processed).toBe(PROSPECT_REVEAL_CHUNK * 2);
    expect(gates).toHaveLength(2);
  });

  it("reports that it is stopping until the chunk already sent lands", async () => {
    const gates: (() => void)[] = [];
    const send = (chunk: { providerRef: string }[]) =>
      new Promise<{ providerRef: string; value: string }[]>((resolve) => {
        gates.push(() => {
          resolve(revealed(chunk));
        });
      });
    const { result } = renderHook(() => useRevealQueue({ send }));
    act(() => {
      result.current.start(profiles(PROSPECT_REVEAL_CHUNK * 2));
    });
    await waitFor(() => {
      expect(gates).toHaveLength(1);
    });
    expect(result.current.stopping).toBe(false);
    act(() => {
      result.current.abort();
    });
    expect(result.current.stopping).toBe(true);
    expect(result.current.status).toBe("running");
    await act(async () => {
      gates[0]?.();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current.status).toBe("aborted");
    });
    expect(result.current.stopping).toBe(false);
  });

  it("throws away an in-flight chunk that lands after a reset", async () => {
    const gates: (() => void)[] = [];
    const send = (chunk: { providerRef: string }[]) =>
      new Promise<{ providerRef: string; value: string }[]>((resolve) => {
        gates.push(() => {
          resolve(revealed(chunk));
        });
      });
    const { result } = renderHook(() => useRevealQueue({ send }));
    act(() => {
      result.current.start(profiles(PROSPECT_REVEAL_CHUNK * 2));
    });
    await waitFor(() => {
      expect(gates).toHaveLength(1);
    });
    act(() => {
      result.current.reset();
    });
    await act(async () => {
      gates[0]?.();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.results).toHaveLength(0);
  });
});
