import { describe, expect, it } from "vitest";
import { formatCurrency } from "./formatCurrency";

describe("formatCurrency", () => {
  it("formats a decimal string as a whole-dollar amount with a thousands separator", () => {
    expect(formatCurrency("25000.00")).toBe("$25,000");
  });

  it("rounds fractional cents to whole dollars", () => {
    expect(formatCurrency("1234567.89")).toBe("$1,234,568");
  });

  it("formats zero", () => {
    expect(formatCurrency("0")).toBe("$0");
  });

  it("accepts a number", () => {
    expect(formatCurrency(4200)).toBe("$4,200");
  });

  it("returns empty string for non-numeric input", () => {
    expect(formatCurrency("abc")).toBe("");
  });

  it("honors a non-default currency", () => {
    expect(formatCurrency("1000", "EUR")).toBe("€1,000");
  });
});
