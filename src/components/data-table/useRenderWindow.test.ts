// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRenderWindow } from "./useRenderWindow";

const items = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

describe("useRenderWindow", () => {
  it("paints only the first `step` items when the list is larger", () => {
    const { result } = renderHook(() => useRenderWindow(items(200), 50));
    expect(result.current.visible).toHaveLength(50);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.remaining).toBe(150);
  });

  it("paints the whole list and reports no more when it fits in one step", () => {
    const { result } = renderHook(() => useRenderWindow(items(30), 50));
    expect(result.current.visible).toHaveLength(30);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.remaining).toBe(0);
  });

  it("reveals the next step on showMore and caps at the list length", () => {
    const { result } = renderHook(() => useRenderWindow(items(120), 50));
    void act(() => result.current.showMore());
    expect(result.current.visible).toHaveLength(100);
    expect(result.current.hasMore).toBe(true);
    void act(() => result.current.showMore());
    expect(result.current.visible).toHaveLength(120);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.remaining).toBe(0);
  });

  it("keeps painting all items when the list shrinks below the current window", () => {
    const { result, rerender } = renderHook(({ n }) => useRenderWindow(items(n), 50), {
      initialProps: { n: 200 },
    });
    void act(() => result.current.showMore()); // window grows to 100
    rerender({ n: 12 }); // e.g. a filter narrowed the set
    expect(result.current.visible).toHaveLength(12);
    expect(result.current.hasMore).toBe(false);
  });
});
