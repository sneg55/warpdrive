import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

describe("scrollbars", () => {
  it("thins every scroll container, not just the root: scrollbar-width does not inherit", () => {
    expect(css).toMatch(/:where\(\*\)\s*\{\s*scrollbar-width:\s*thin/);
  });

  it("keeps the track transparent, so a lane's own background shows through it", () => {
    expect(css).toMatch(/scrollbar-color:\s*[^;]*transparent/);
  });

  it("draws the thumb from a token, so it is defined in both themes rather than once", () => {
    expect(css).toMatch(/--scrollbar-thumb:/);
    const dark = /\.dark\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(dark).toMatch(/--scrollbar-thumb:/);
  });

  it("does not style ::-webkit-scrollbar, which would force always-visible bars on macOS", () => {
    expect(css).not.toMatch(/::-webkit-scrollbar/);
  });
});
