import { describe, expect, it } from "vitest";
import { AppError } from "@/constants/errorIds";
import { compileLeadFilter, LEAD_FILTER_CONFIG } from "./leadFilter";

describe("compileLeadFilter", () => {
  it("returns null for an empty condition set", () => {
    expect(compileLeadFilter({ combinator: "and", conditions: [] }, LEAD_FILTER_CONFIG)).toBeNull();
  });

  it("compiles a title-contains condition into a SQL fragment", () => {
    const frag = compileLeadFilter(
      { combinator: "and", conditions: [{ field: "title", op: "contains", value: "acme" }] },
      LEAD_FILTER_CONFIG,
    );
    expect(frag).not.toBeNull();
  });

  it("throws AppError for a field/op pairing outside the allow-list", () => {
    expect(() =>
      compileLeadFilter(
        // contains is not allowed on the numeric value column.
        { combinator: "and", conditions: [{ field: "value", op: "contains", value: "5" }] },
        LEAD_FILTER_CONFIG,
      ),
    ).toThrow(AppError);
  });

  it("throws AppError for an unknown field", () => {
    expect(() =>
      compileLeadFilter(
        { combinator: "and", conditions: [{ field: "bogus", op: "eq", value: "x" }] },
        LEAD_FILTER_CONFIG,
      ),
    ).toThrow(AppError);
  });
});
