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
