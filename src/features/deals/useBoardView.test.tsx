// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@/features/identity/preferencesActions", () => ({
  setBoardViewAction: () => Promise.resolve({ ok: true }),
}));

import { DEFAULT_BOARD_VIEW } from "./boardView";
import { forgetBoardView } from "./boardViewMemory";
import type { SavedFilterView } from "./savedFilterView";
import { useBoardView } from "./useBoardView";

afterEach(() => {
  forgetBoardView();
});

const ROTTING: SavedFilterView = {
  id: "1c235b57-30c5-4b16-8041-3a851f6d8f0a",
  name: "Rotting deals",
  favorite: false,
  isShared: true,
  isOwn: false,
  definition: { combinator: "and", conditions: [], rotting: true },
};

describe("useBoardView across a remount with a stale server seed", () => {
  test("a fresh load takes the server seed and is not a restore", () => {
    const { result } = renderHook(() => useBoardView({ ...DEFAULT_BOARD_VIEW, ownerId: "u1" }));
    expect(result.current.ownerId).toBe("u1");
    expect(result.current.restored).toBe(false);
  });

  test("the filter picked before navigating away survives a remount seeded from the old page", () => {
    const first = renderHook(() => useBoardView(DEFAULT_BOARD_VIEW));
    act(() => first.result.current.setSavedFilter(ROTTING));
    expect(first.result.current.savedFilter?.id).toBe(ROTTING.id);
    first.unmount();

    const second = renderHook(() => useBoardView(DEFAULT_BOARD_VIEW));
    expect(second.result.current.savedFilter?.id).toBe(ROTTING.id);
    expect(second.result.current.restored).toBe(true);
  });

  test("owner and sort choices survive the remount too", () => {
    const first = renderHook(() => useBoardView(DEFAULT_BOARD_VIEW));
    act(() => {
      first.result.current.setOwnerId("u2");
      first.result.current.setSortKey("value");
      first.result.current.toggleSortDirection();
    });
    first.unmount();

    const second = renderHook(() => useBoardView(DEFAULT_BOARD_VIEW));
    expect(second.result.current.ownerId).toBe("u2");
    expect(second.result.current.sortKey).toBe("value");
    expect(second.result.current.sortDir).toBe("desc");
  });

  test("a cleared filter stays cleared after the remount", () => {
    const first = renderHook(() => useBoardView({ ...DEFAULT_BOARD_VIEW, savedFilter: ROTTING }));
    act(() => first.result.current.clearFilters());
    first.unmount();

    const second = renderHook(() => useBoardView({ ...DEFAULT_BOARD_VIEW, savedFilter: ROTTING }));
    expect(second.result.current.savedFilter).toBeNull();
  });
});
