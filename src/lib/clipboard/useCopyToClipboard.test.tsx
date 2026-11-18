// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COPY_STATUS_RESET_MS } from "@/constants/clipboard";
import { useCopyToClipboard } from "./useCopyToClipboard";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function stubClipboard(writeText: () => Promise<void>): void {
  vi.stubGlobal("navigator", { clipboard: { writeText } });
}

describe("useCopyToClipboard", () => {
  it("starts idle, goes copied on success, then resets", async () => {
    stubClipboard(() => Promise.resolve());
    const { result } = renderHook(() => useCopyToClipboard());
    expect(result.current.status).toBe("idle");
    await act(async () => {
      await result.current.copy("x");
    });
    expect(result.current.status).toBe("copied");
    act(() => {
      vi.advanceTimersByTime(COPY_STATUS_RESET_MS);
    });
    expect(result.current.status).toBe("idle");
  });

  it("goes failed when the write is denied, then resets", async () => {
    stubClipboard(() => Promise.reject(new DOMException("denied", "NotAllowedError")));
    const { result } = renderHook(() => useCopyToClipboard());
    let ok = true;
    await act(async () => {
      ok = (await result.current.copy("x")).ok;
    });
    expect(ok).toBe(false);
    expect(result.current.status).toBe("failed");
    act(() => {
      vi.advanceTimersByTime(COPY_STATUS_RESET_MS);
    });
    expect(result.current.status).toBe("idle");
  });

  it("restarts the reset window on a second copy", async () => {
    stubClipboard(() => Promise.resolve());
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => {
      await result.current.copy("x");
    });
    act(() => {
      vi.advanceTimersByTime(COPY_STATUS_RESET_MS - 100);
    });
    await act(async () => {
      await result.current.copy("x");
    });
    act(() => {
      vi.advanceTimersByTime(COPY_STATUS_RESET_MS - 100);
    });
    expect(result.current.status).toBe("copied");
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.status).toBe("idle");
  });
});
