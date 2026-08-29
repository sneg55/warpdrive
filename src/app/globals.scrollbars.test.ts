import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

describe("scrollbars", () => {
  it("thins every scroll container, not just the root: scrollbar-width does not inherit", () => {
    // Measured in Chrome: with the declaration only on :root, a board lane still computed
    // scrollbar-width: auto. Only scrollbar-color inherits; scrollbar-width has to be universal.
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
    // Styling the webkit pseudo-elements opts out of the platform's overlay scrollbars, so a
    // trackpad user who sees nothing today would start seeing a bar on every scroll container.
    expect(css).not.toMatch(/::-webkit-scrollbar/);
  });
});
