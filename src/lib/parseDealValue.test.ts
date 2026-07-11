import { describe, expect, it } from "vitest";
import { parseDealValue } from "./parseDealValue";

describe("parseDealValue", () => {
  it("parses a decimal string to a number", () => {
    expect(parseDealValue("25000.00")).toBe(25000);
    expect(parseDealValue("9")).toBe(9);
  });

  it("returns null for a null value", () => {
    expect(parseDealValue(null)).toBeNull();
  });

  it("returns null for an empty or whitespace-only string (unset)", () => {
    expect(parseDealValue("")).toBeNull();
    expect(parseDealValue("   ")).toBeNull();
  });

  it("returns null for a non-numeric string", () => {
    expect(parseDealValue("abc")).toBeNull();
  });
});
