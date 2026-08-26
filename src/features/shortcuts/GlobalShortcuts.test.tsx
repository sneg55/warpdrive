// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NAV_ITEMS } from "@/constants/nav";
import { GlobalShortcuts } from "./GlobalShortcuts";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  push.mockClear();
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("GlobalShortcuts number keys", () => {
  test("1 navigates to the first nav item", () => {
    render(<GlobalShortcuts />);
    fireEvent.keyDown(window, { key: "1" });
    expect(push).toHaveBeenCalledWith(NAV_ITEMS[0]?.href);
  });

  test("4 navigates to the fourth nav item", () => {
    render(<GlobalShortcuts />);
    fireEvent.keyDown(window, { key: "4" });
    expect(push).toHaveBeenCalledWith(NAV_ITEMS[3]?.href);
  });

  test("a digit past the end of the nav navigates nowhere", () => {
    render(<GlobalShortcuts />);
    fireEvent.keyDown(window, { key: String(NAV_ITEMS.length + 1) });
    expect(push).not.toHaveBeenCalled();
  });

  test("does not fire while typing in a text field", () => {
    render(<GlobalShortcuts />);
    const input = document.createElement("input");
    document.body.append(input);
    fireEvent.keyDown(input, { key: "2" });
    expect(push).not.toHaveBeenCalled();
  });

  test("does not fire while a dialog is open", () => {
    render(<GlobalShortcuts />);
    document.body.insertAdjacentHTML("beforeend", '<div role="dialog"></div>');
    fireEvent.keyDown(window, { key: "2" });
    expect(push).not.toHaveBeenCalled();
  });

  test("leaves Cmd+1 to the browser", () => {
    render(<GlobalShortcuts />);
    fireEvent.keyDown(window, { key: "1", metaKey: true });
    expect(push).not.toHaveBeenCalled();
  });

  test("unbinds on unmount", () => {
    const view = render(<GlobalShortcuts />);
    view.unmount();
    fireEvent.keyDown(window, { key: "1" });
    expect(push).not.toHaveBeenCalled();
  });
});
