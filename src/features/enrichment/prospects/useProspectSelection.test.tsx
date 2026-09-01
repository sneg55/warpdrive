// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PROSPECT_SELECTION_MAX } from "@/constants/prospectSearch";
import { useProspectSelection } from "./useProspectSelection";

describe("useProspectSelection", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useProspectSelection());
    expect(result.current.count).toBe(0);
    expect(result.current.selected).toEqual([]);
  });

  it("toggles one profile on and off", () => {
    const { result } = renderHook(() => useProspectSelection());
    act(() => {
      result.current.toggle("a");
    });
    expect(result.current.isSelected("a")).toBe(true);
    act(() => {
      result.current.toggle("a");
    });
    expect(result.current.isSelected("a")).toBe(false);
  });

  it("selects a page without dropping earlier pages", () => {
    const { result } = renderHook(() => useProspectSelection());
    act(() => {
      result.current.selectMany(["a", "b"]);
    });
    act(() => {
      result.current.selectMany(["c"]);
    });
    expect(result.current.selected).toEqual(["a", "b", "c"]);
  });

  it("deselects only the page it is given", () => {
    const { result } = renderHook(() => useProspectSelection());
    act(() => {
      result.current.selectMany(["a", "b", "c"]);
    });
    act(() => {
      result.current.deselectMany(["b", "c"]);
    });
    expect(result.current.selected).toEqual(["a"]);
  });

  it("refuses to exceed the cap and reports being full", () => {
    const { result } = renderHook(() => useProspectSelection());
    const many = Array.from({ length: PROSPECT_SELECTION_MAX + 5 }, (_, i) => `p${i}`);
    act(() => {
      result.current.selectMany(many);
    });
    expect(result.current.count).toBe(PROSPECT_SELECTION_MAX);
    expect(result.current.isFull).toBe(true);
    act(() => {
      result.current.toggle("beyond");
    });
    expect(result.current.isSelected("beyond")).toBe(false);
  });

  it("keeps insertion order so the reveal queue is deterministic", () => {
    const { result } = renderHook(() => useProspectSelection());
    act(() => {
      result.current.toggle("c");
    });
    act(() => {
      result.current.toggle("a");
    });
    act(() => {
      result.current.toggle("b");
    });
    expect(result.current.selected).toEqual(["c", "a", "b"]);
  });

  it("clears everything", () => {
    const { result } = renderHook(() => useProspectSelection());
    act(() => {
      result.current.selectMany(["a", "b"]);
    });
    act(() => {
      result.current.clear();
    });
    expect(result.current.count).toBe(0);
  });
});
