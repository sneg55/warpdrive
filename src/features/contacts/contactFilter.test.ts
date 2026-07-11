import { describe, expect, it } from "vitest";
import {
  compileContactFilter,
  ORG_COLUMN_SQL,
  ORG_FILTER_CONFIG,
  orgFilterSchema,
  PERSON_COLUMN_SQL,
  PERSON_FILTER_CONFIG,
  personFilterSchema,
} from "./contactFilter";

describe("contactFilter schemas (boundary validation)", () => {
  it("accepts a valid person text condition", () => {
    const r = personFilterSchema.safeParse({
      combinator: "and",
      conditions: [{ field: "name", op: "contains", value: "acme" }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects contains on an exact-only person field (ownerId)", () => {
    const r = personFilterSchema.safeParse({
      combinator: "and",
      conditions: [{ field: "ownerId", op: "contains", value: "x" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown person field", () => {
    const r = personFilterSchema.safeParse({
      combinator: "and",
      conditions: [{ field: "ssn", op: "eq", value: "x" }],
    });
    expect(r.success).toBe(false);
  });

  it("requires a numeric value for org employeeCount ordered ops", () => {
    expect(
      orgFilterSchema.safeParse({
        combinator: "and",
        conditions: [{ field: "employeeCount", op: "gt", value: "big" }],
      }).success,
    ).toBe(false);
    expect(
      orgFilterSchema.safeParse({
        combinator: "and",
        conditions: [{ field: "employeeCount", op: "gt", value: 50 }],
      }).success,
    ).toBe(true);
  });
});

describe("compileContactFilter (defense in depth)", () => {
  it("throws on a field outside the allow-list even if it slips past Zod", () => {
    expect(() =>
      compileContactFilter(
        { combinator: "and", conditions: [{ field: "ssn", op: "eq", value: "x" }] },
        PERSON_FILTER_CONFIG,
        PERSON_COLUMN_SQL,
      ),
    ).toThrow();
  });

  it("returns null for an empty condition set (no-op filter)", () => {
    expect(
      compileContactFilter(
        { combinator: "and", conditions: [] },
        ORG_FILTER_CONFIG,
        ORG_COLUMN_SQL,
      ),
    ).toBeNull();
  });
});
