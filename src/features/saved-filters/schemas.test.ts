import { describe, expect, it } from "vitest";
import { filterCondition } from "./schemas";

describe("filterCondition field/op pairing", () => {
  it("accepts contains on the text field title", () => {
    expect(
      filterCondition.safeParse({ field: "title", op: "contains", value: "acme" }).success,
    ).toBe(true);
  });

  it("rejects contains on the numeric value field (would be ILIKE on numeric -> SQL error)", () => {
    expect(filterCondition.safeParse({ field: "value", op: "contains", value: "5" }).success).toBe(
      false,
    );
  });

  it("rejects contains on the uuid ownerId field", () => {
    expect(
      filterCondition.safeParse({ field: "ownerId", op: "contains", value: "x" }).success,
    ).toBe(false);
  });

  it("rejects an ordering op on the enum status field", () => {
    expect(filterCondition.safeParse({ field: "status", op: "gt", value: "open" }).success).toBe(
      false,
    );
  });

  it("accepts gt on value with a numeric string", () => {
    expect(filterCondition.safeParse({ field: "value", op: "gt", value: "1000" }).success).toBe(
      true,
    );
  });

  it("rejects a non-numeric value on the numeric value field (would fail the numeric cast)", () => {
    expect(filterCondition.safeParse({ field: "value", op: "gt", value: "abc" }).success).toBe(
      false,
    );
  });
});

describe("filterCondition on the labels array field", () => {
  it("accepts eq with a label key", () => {
    expect(filterCondition.safeParse({ field: "labels", op: "eq", value: "hot" }).success).toBe(
      true,
    );
  });

  it("accepts neq with a label key", () => {
    expect(filterCondition.safeParse({ field: "labels", op: "neq", value: "hot" }).success).toBe(
      true,
    );
  });

  it("rejects an ordering op on labels (array containment has no ordering)", () => {
    expect(filterCondition.safeParse({ field: "labels", op: "gt", value: "hot" }).success).toBe(
      false,
    );
  });

  it("rejects contains on labels (ILIKE on text[] is a Postgres type error)", () => {
    expect(
      filterCondition.safeParse({ field: "labels", op: "contains", value: "hot" }).success,
    ).toBe(false);
  });

  it("rejects an empty label value (ARRAY[''] matches nothing and reads as a no-op)", () => {
    expect(filterCondition.safeParse({ field: "labels", op: "eq", value: "" }).success).toBe(false);
    expect(filterCondition.safeParse({ field: "labels", op: "eq", value: "  " }).success).toBe(
      false,
    );
  });

  it("rejects a numeric label value (label keys are text)", () => {
    expect(filterCondition.safeParse({ field: "labels", op: "eq", value: 3 }).success).toBe(false);
  });
});

// "is any of": a labels condition may carry several names at once, which only means anything now
// that the combinator can OR. Every other field still takes exactly one value.
describe("filterCondition with a list of label values", () => {
  it("accepts a list on eq and on neq", () => {
    expect(
      filterCondition.safeParse({ field: "labels", op: "eq", value: ["hot", "warm"] }).success,
    ).toBe(true);
    expect(
      filterCondition.safeParse({ field: "labels", op: "neq", value: ["hot", "warm"] }).success,
    ).toBe(true);
  });

  it("still accepts a single label string", () => {
    expect(filterCondition.safeParse({ field: "labels", op: "eq", value: "hot" }).success).toBe(
      true,
    );
  });

  // An empty list compiles to a condition that can never match, which reads to the user as a
  // filter that quietly ate every row. Reject it at the boundary instead.
  it("rejects an empty list", () => {
    expect(filterCondition.safeParse({ field: "labels", op: "eq", value: [] }).success).toBe(false);
  });

  it("rejects a list holding a blank label", () => {
    expect(
      filterCondition.safeParse({ field: "labels", op: "eq", value: ["hot", "  "] }).success,
    ).toBe(false);
  });

  it("rejects a list on a scalar field", () => {
    expect(filterCondition.safeParse({ field: "title", op: "eq", value: ["a", "b"] }).success).toBe(
      false,
    );
    expect(filterCondition.safeParse({ field: "value", op: "gt", value: ["1"] }).success).toBe(
      false,
    );
    expect(filterCondition.safeParse({ field: "ownerId", op: "eq", value: ["x"] }).success).toBe(
      false,
    );
  });
});

// isEmpty/isNotEmpty carry no value, so the builder submits the row with the value key absent or
// blank. Every per-field value check has to stand down for them or a complete row reads as broken.
describe("filterCondition with a valueless operator", () => {
  it("accepts isEmpty with no value key at all", () => {
    for (const field of ["title", "orgName", "value", "expectedCloseDate", "labels"]) {
      expect(filterCondition.safeParse({ field, op: "isEmpty" }).success).toBe(true);
    }
  });

  it("accepts isNotEmpty with an empty-string value", () => {
    for (const field of ["title", "value", "expectedCloseDate", "labels"]) {
      expect(filterCondition.safeParse({ field, op: "isNotEmpty", value: "" }).success).toBe(true);
    }
  });

  it("still rejects a valueless op on a field whose class does not allow it", () => {
    expect(filterCondition.safeParse({ field: "ownerId", op: "isEmpty" }).success).toBe(false);
    expect(filterCondition.safeParse({ field: "status", op: "isNotEmpty" }).success).toBe(false);
  });

  it("still requires a value for the ops that compare against one", () => {
    expect(filterCondition.safeParse({ field: "title", op: "contains" }).success).toBe(false);
    expect(filterCondition.safeParse({ field: "value", op: "gt" }).success).toBe(false);
  });
});

describe("filterCondition with the Tier 2 text operators", () => {
  it("accepts startsWith and notContains on text fields", () => {
    for (const op of ["startsWith", "notContains"]) {
      expect(filterCondition.safeParse({ field: "title", op, value: "acme" }).success).toBe(true);
      expect(filterCondition.safeParse({ field: "orgName", op, value: "acme" }).success).toBe(true);
    }
  });

  it("rejects startsWith and notContains on non-text columns", () => {
    for (const op of ["startsWith", "notContains"]) {
      expect(filterCondition.safeParse({ field: "value", op, value: "5" }).success).toBe(false);
      expect(filterCondition.safeParse({ field: "ownerId", op, value: "x" }).success).toBe(false);
      expect(filterCondition.safeParse({ field: "labels", op, value: "hot" }).success).toBe(false);
    }
  });
});
