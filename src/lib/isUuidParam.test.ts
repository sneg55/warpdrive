import { describe, expect, it } from "vitest";
import { isUuidParam } from "./isUuidParam";

describe("isUuidParam", () => {
  it("accepts a canonical v4 uuid", () => {
    expect(isUuidParam("9cc84465-b904-4963-951a-6a654604ed73")).toBe(true);
  });

  it("rejects a plainly non-uuid path segment", () => {
    expect(isUuidParam("inbox")).toBe(false);
    expect(isUuidParam("not-a-uuid")).toBe(false);
  });

  it("rejects the empty string", () => {
    expect(isUuidParam("")).toBe(false);
  });

  it("rejects a uuid with surrounding whitespace (no trimming, exact match only)", () => {
    expect(isUuidParam(" 9cc84465-b904-4963-951a-6a654604ed73 ")).toBe(false);
  });

  it("rejects a string that is uuid-shaped but too short", () => {
    expect(isUuidParam("9cc84465-b904-4963-951a-6a654604ed7")).toBe(false);
  });
});
