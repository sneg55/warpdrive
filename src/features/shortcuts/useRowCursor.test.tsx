// @vitest-environment jsdom
import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useRowCursor } from "./useRowCursor";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("useRowCursor", () => {
  test("j walks down the list", () => {
    const { result } = renderHook(() => useRowCursor(3, vi.fn()));
    fireEvent.keyDown(window, { key: "j" });
    expect(result.current).toBe(0);
    fireEvent.keyDown(window, { key: "j" });
    expect(result.current).toBe(1);
  });

  test("k walks back up the list", () => {
    const { result } = renderHook(() => useRowCursor(3, vi.fn()));
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "k" });
    expect(result.current).toBe(0);
  });

  test("Enter activates the row under the cursor", () => {
    const onActivate = vi.fn();
    renderHook(() => useRowCursor(3, onActivate));
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onActivate).toHaveBeenCalledWith(1);
  });

  test("Enter does nothing before the cursor has been placed", () => {
    const onActivate = vi.fn();
    renderHook(() => useRowCursor(3, onActivate));
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onActivate).not.toHaveBeenCalled();
  });

  test("stays put on an empty list", () => {
    const { result } = renderHook(() => useRowCursor(0, vi.fn()));
    fireEvent.keyDown(window, { key: "j" });
    expect(result.current).toBeNull();
  });

  test("clamps a cursor left behind by a list that shrank", () => {
    const { result, rerender } = renderHook(({ count }) => useRowCursor(count, vi.fn()), {
      initialProps: { count: 5 },
    });
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "j" });
    expect(result.current).toBe(2);
    rerender({ count: 2 });
    expect(result.current).toBe(1);
  });

  test("drops the cursor when the list empties", () => {
    const { result, rerender } = renderHook(({ count }) => useRowCursor(count, vi.fn()), {
      initialProps: { count: 3 },
    });
    fireEvent.keyDown(window, { key: "j" });
    rerender({ count: 0 });
    expect(result.current).toBeNull();
  });

  test("ignores j while typing in a text field", () => {
    const { result } = renderHook(() => useRowCursor(3, vi.fn()));
    const input = document.createElement("input");
    document.body.append(input);
    fireEvent.keyDown(input, { key: "j" });
    expect(result.current).toBeNull();
  });

  test("ignores j while a dialog is open", () => {
    const { result } = renderHook(() => useRowCursor(3, vi.fn()));
    document.body.insertAdjacentHTML("beforeend", '<div role="dialog"></div>');
    fireEvent.keyDown(window, { key: "j" });
    expect(result.current).toBeNull();
  });

  test("leaves Cmd+j to the browser", () => {
    const { result } = renderHook(() => useRowCursor(3, vi.fn()));
    fireEvent.keyDown(window, { key: "j", metaKey: true });
    expect(result.current).toBeNull();
  });

  test("Enter on a focused button presses the button, not the cursor row", () => {
    const onActivate = vi.fn();
    renderHook(() => useRowCursor(3, onActivate));
    fireEvent.keyDown(window, { key: "j" });
    const button = document.createElement("button");
    document.body.append(button);
    fireEvent.keyDown(button, { key: "Enter" });
    expect(onActivate).not.toHaveBeenCalled();
  });

  test("unbinds on unmount", () => {
    const onActivate = vi.fn();
    const { unmount } = renderHook(() => useRowCursor(3, onActivate));
    unmount();
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onActivate).not.toHaveBeenCalled();
  });
});
