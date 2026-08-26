import { describe, expect, test } from "vitest";
import { nextCursorIndex } from "./rowCursor";

describe("nextCursorIndex", () => {
  test("moving down from no cursor lands on the first row", () => {
    expect(nextCursorIndex(null, 5, 1)).toBe(0);
  });

  test("moving up from no cursor lands on the last row", () => {
    expect(nextCursorIndex(null, 5, -1)).toBe(4);
  });

  test("moving down advances one row", () => {
    expect(nextCursorIndex(1, 5, 1)).toBe(2);
  });

  test("moving up retreats one row", () => {
    expect(nextCursorIndex(3, 5, -1)).toBe(2);
  });

  test("clamps at the last row instead of wrapping", () => {
    expect(nextCursorIndex(4, 5, 1)).toBe(4);
  });

  test("clamps at the first row instead of wrapping", () => {
    expect(nextCursorIndex(0, 5, -1)).toBe(0);
  });

  test("returns null when there are no rows", () => {
    expect(nextCursorIndex(null, 0, 1)).toBeNull();
  });

  test("clamps a stale cursor left over from a longer list", () => {
    expect(nextCursorIndex(9, 3, 1)).toBe(2);
  });
});
