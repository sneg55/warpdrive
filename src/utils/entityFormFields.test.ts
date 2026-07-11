import { describe, expect, it } from "vitest";
import { orNull, parseMoneyValue, resolveLabelKey } from "./entityFormFields";

describe("orNull", () => {
  it("collapses blank and whitespace to null, trims otherwise", () => {
    expect(orNull(null)).toBeNull();
    expect(orNull(undefined)).toBeNull();
    expect(orNull("   ")).toBeNull();
    expect(orNull("  hi ")).toBe("hi");
  });
});

describe("parseMoneyValue", () => {
  it("treats blank as no value", () => {
    expect(parseMoneyValue("")).toEqual({ ok: true, value: null });
    expect(parseMoneyValue("  ")).toEqual({ ok: true, value: null });
  });

  it("rounds to cents so it satisfies the multipleOf(0.01) column", () => {
    expect(parseMoneyValue("1200")).toEqual({ ok: true, value: 1200 });
    expect(parseMoneyValue("9.999")).toEqual({ ok: true, value: 10 });
    expect(parseMoneyValue("9.994")).toEqual({ ok: true, value: 9.99 });
  });

  it("rejects negative or non-numeric input", () => {
    expect(parseMoneyValue("-5").ok).toBe(false);
    expect(parseMoneyValue("abc").ok).toBe(false);
  });
});

describe("resolveLabelKey", () => {
  it("keeps any non-blank catalog label name and nulls blanks (labels are user-managed now)", () => {
    expect(resolveLabelKey("Hot")).toBe("Hot");
    expect(resolveLabelKey("Enterprise")).toBe("Enterprise");
    expect(resolveLabelKey("   ")).toBeNull();
    expect(resolveLabelKey(null)).toBeNull();
  });
});
