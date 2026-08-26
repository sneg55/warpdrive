// @vitest-environment jsdom
import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useSearchHotkey } from "./useSearchHotkey";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("useSearchHotkey", () => {
  test("/ opens the palette", () => {
    const onOpen = vi.fn();
    renderHook(() => useSearchHotkey(onOpen));
    fireEvent.keyDown(window, { key: "/" });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  test("Cmd+K opens the palette", () => {
    const onOpen = vi.fn();
    renderHook(() => useSearchHotkey(onOpen));
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  test("/ typed into a text input does not open the palette", () => {
    const onOpen = vi.fn();
    renderHook(() => useSearchHotkey(onOpen));
    const input = document.createElement("input");
    document.body.append(input);
    fireEvent.keyDown(input, { key: "/" });
    expect(onOpen).not.toHaveBeenCalled();
  });

  test("/ typed into the rich-text composer does not open the palette", () => {
    const onOpen = vi.fn();
    renderHook(() => useSearchHotkey(onOpen));
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    document.body.append(editor);
    fireEvent.keyDown(editor, { key: "/" });
    expect(onOpen).not.toHaveBeenCalled();
  });

  test("Cmd+K still opens the palette from inside a text input", () => {
    const onOpen = vi.fn();
    renderHook(() => useSearchHotkey(onOpen));
    const input = document.createElement("input");
    document.body.append(input);
    fireEvent.keyDown(input, { key: "k", metaKey: true });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
