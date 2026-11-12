// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BOARD_VIEW_PERSIST_DEBOUNCE_MS } from "@/constants/boardView";

const setBoardViewAction = vi.fn((pref: unknown) => Promise.resolve({ ok: true, pref }));
vi.mock("@/features/identity/preferencesActions", () => ({
  setBoardViewAction: (pref: unknown) => setBoardViewAction(pref),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "tok" }));

import { type BoardViewState, DEFAULT_BOARD_VIEW } from "./boardView";
import { forgetBoardView, recallBoardView, rememberBoardView } from "./boardViewMemory";
import { useBoardView } from "./useBoardView";

const REMEMBERED: BoardViewState = { ...DEFAULT_BOARD_VIEW, ownerId: "u9" };
const DRILL: BoardViewState = {
  ...DEFAULT_BOARD_VIEW,
  conditions: { combinator: "and", conditions: [{ field: "status", op: "eq", value: "won" }] },
};

beforeEach(() => {
  vi.useFakeTimers();
  rememberBoardView(REMEMBERED);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  forgetBoardView();
});

describe("useBoardView seeded by a dashboard drill-down", () => {
  test("the drill-down seed beats the view remembered from earlier in the session", () => {
    const { result } = renderHook(() => useBoardView(DRILL, { fromDrillDown: true }));
    expect(result.current.conditions).toEqual(DRILL.conditions);
    expect(result.current.ownerId).toBeNull();
    expect(result.current.restored).toBe(false);
  });

  test("loading the drill-down neither persists it nor replaces the remembered view", () => {
    const { unmount } = renderHook(() => useBoardView(DRILL, { fromDrillDown: true }));
    act(() => {
      vi.advanceTimersByTime(BOARD_VIEW_PERSIST_DEBOUNCE_MS * 2);
    });
    unmount();
    expect(setBoardViewAction).not.toHaveBeenCalled();
    expect(recallBoardView()).toEqual(REMEMBERED);
  });

  test("a change the user makes afterwards is persisted and remembered as usual", () => {
    const { result } = renderHook(() => useBoardView(DRILL, { fromDrillDown: true }));
    act(() => result.current.setConditions(null));
    act(() => {
      vi.advanceTimersByTime(BOARD_VIEW_PERSIST_DEBOUNCE_MS * 2);
    });
    expect(setBoardViewAction).toHaveBeenCalledTimes(1);
    expect(setBoardViewAction.mock.calls[0]?.[0]).toMatchObject({ conditions: null });
    expect(recallBoardView()?.conditions).toBeNull();
  });
  test("an edit the user undoes back to the drill-down seed is still persisted and remembered", () => {
    const { result } = renderHook(() => useBoardView(DRILL, { fromDrillDown: true }));
    act(() => result.current.setOwnerId("u1"));
    act(() => result.current.setOwnerId(null));
    act(() => {
      vi.advanceTimersByTime(BOARD_VIEW_PERSIST_DEBOUNCE_MS * 2);
    });
    expect(setBoardViewAction).toHaveBeenCalledTimes(1);
    expect(setBoardViewAction.mock.calls[0]?.[0]).toMatchObject({ ownerId: null });
    expect(recallBoardView()?.ownerId).toBeNull();
  });
});
