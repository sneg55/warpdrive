import { describe, expect, it } from "vitest";
import { ARRAY_OPS, EXACT_OPS, ORDERED_OPS, TEXT_OPS } from "./filterOps";

describe("filter operator classes", () => {
  it("offers the tier 2 operators on text columns", () => {
    expect(TEXT_OPS).toEqual(
      expect.arrayContaining(["startsWith", "notContains", "isEmpty", "isNotEmpty"]),
    );
  });

  it("offers the emptiness checks but not startsWith on ordered columns", () => {
    expect(ORDERED_OPS).toEqual(expect.arrayContaining(["isEmpty", "isNotEmpty"]));
    expect(ORDERED_OPS).not.toContain("startsWith");
  });

  it("offers the emptiness checks on array columns", () => {
    expect(ARRAY_OPS).toEqual(expect.arrayContaining(["isEmpty", "isNotEmpty"]));
  });

  it("omits the emptiness checks on identity columns, which are NOT NULL", () => {
    expect(EXACT_OPS).not.toContain("isEmpty");
    expect(EXACT_OPS).not.toContain("isNotEmpty");
  });
});
