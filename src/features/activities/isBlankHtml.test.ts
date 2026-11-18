import { describe, expect, it } from "vitest";
import { isBlankHtml } from "./isBlankHtml";

describe("isBlankHtml", () => {
  it.each([
    ["", true],
    ["   ", true],
    ["<p></p>", true],
    ["<p><br></p>", true],
    ["<p>  </p>", true],
    ["<p>&nbsp;</p>", true],
    ["<p>hi</p>", false],
    ["<p><strong>x</strong></p>", false],
    ['<p><img src="x"></p>', false],
    ['<img src="x">', false],
    ["<hr>", false],
    ['<IMG SRC="x">', false],
  ])("isBlankHtml(%j) -> %s", (html, expected) => {
    expect(isBlankHtml(html)).toBe(expected);
  });
});
