// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceSync } from "./AppearanceSync";
import { APPEARANCE_COOKIE, DARK_CLASS } from "./appearance";

let listeners: Array<() => void> = [];
let matches = false;

function stubMatchMedia(): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return matches;
      },
      addEventListener: (_: string, fn: () => void) => listeners.push(fn),
      removeEventListener: (_: string, fn: () => void) => {
        listeners = listeners.filter((l) => l !== fn);
      },
    })),
  );
}

beforeEach(() => {
  listeners = [];
  matches = false;
  document.documentElement.className = "";
  document.cookie = `${APPEARANCE_COOKIE}=; max-age=0; path=/`;
  stubMatchMedia();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AppearanceSync", () => {
  it("follows a live OS switch when the choice is System", () => {
    render(<AppearanceSync />);
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
    matches = true;
    act(() => {
      for (const l of listeners) l();
    });
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
  });

  it("ignores the OS when the user pinned Day", () => {
    document.cookie = `${APPEARANCE_COOKIE}=day; path=/`;
    render(<AppearanceSync />);
    matches = true;
    act(() => {
      for (const l of listeners) l();
    });
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
  });

  it("renders nothing", () => {
    const { container } = render(<AppearanceSync />);
    expect(container).toBeEmptyDOMElement();
  });
});
