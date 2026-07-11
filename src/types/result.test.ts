import { describe, expect, expectTypeOf, test } from "vitest";
import { assertNever, err, ok, type Result } from "./result";

describe("Result", () => {
  test("ok carries a value and narrows", () => {
    const r: Result<number, string> = ok(42);
    if (r.ok) {
      expect(r.value).toBe(42);
      expectTypeOf(r.value).toEqualTypeOf<number>();
    } else {
      throw new Error("should be ok");
    }
  });

  test("err carries an error and narrows", () => {
    const r: Result<number, string> = err("boom");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("boom");
  });

  test("assertNever throws on an unexpected value", () => {
    expect(() => assertNever("x" as never)).toThrow();
  });
});
