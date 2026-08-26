import { describe, expect, test } from "vitest";
import { navHrefForKey } from "./navShortcut";

const ITEMS = [{ href: "/a" }, { href: "/b" }, { href: "/c" }];

describe("navHrefForKey", () => {
  test("maps 1 to the first nav item", () => {
    expect(navHrefForKey("1", ITEMS)).toBe("/a");
  });

  test("maps 3 to the third nav item", () => {
    expect(navHrefForKey("3", ITEMS)).toBe("/c");
  });

  test("returns null past the end of the nav", () => {
    expect(navHrefForKey("4", ITEMS)).toBeNull();
  });

  test("returns null for 0, which addresses no item", () => {
    expect(navHrefForKey("0", ITEMS)).toBeNull();
  });

  test("returns null for a non-digit key", () => {
    expect(navHrefForKey("k", ITEMS)).toBeNull();
  });

  test("returns null for a multi-character key name", () => {
    expect(navHrefForKey("F1", ITEMS)).toBeNull();
  });
});
