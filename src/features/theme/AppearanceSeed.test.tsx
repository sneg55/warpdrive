// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APPEARANCE_COOKIE,
  appearanceSeedScript,
  DARK_CLASS,
  readAppearanceCookie,
} from "./appearance";

function clearCookie(): void {
  document.cookie = `${APPEARANCE_COOKIE}=; max-age=0; path=/`;
}

function setPrefersDark(matches: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

function run(stored: Parameters<typeof appearanceSeedScript>[0]): void {
  // biome-ignore lint/security/noGlobalEval: running the real inlined source is the point of the test
  eval(appearanceSeedScript(stored));
}

beforeEach(() => {
  document.documentElement.className = "";
  clearCookie();
  setPrefersDark(false);
});

afterEach(() => {
  clearCookie();
  vi.unstubAllGlobals();
});

describe("appearanceSeedScript", () => {
  it("writes the account's appearance when the device has no cookie", () => {
    run("night");

    expect(readAppearanceCookie(document.cookie)).toBe("night");
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
  });

  it("overrides a cookie left behind by another account", () => {
    document.cookie = `${APPEARANCE_COOKIE}=night; path=/`;

    run("day");

    expect(readAppearanceCookie(document.cookie)).toBe("day");
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
  });

  it("follows the OS when the account's choice is System", () => {
    setPrefersDark(true);
    document.cookie = `${APPEARANCE_COOKIE}=day; path=/`;

    run("system");

    expect(readAppearanceCookie(document.cookie)).toBe("system");
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
  });

  it("carries no closing script tag that would break out of the inline block", () => {
    expect(appearanceSeedScript("night")).not.toContain("</script");
  });

  it("survives a browser with no matchMedia rather than throwing", () => {
    vi.stubGlobal("matchMedia", undefined);

    expect(() => {
      run("system");
    }).not.toThrow();
  });
});
