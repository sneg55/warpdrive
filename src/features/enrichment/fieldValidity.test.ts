import { describe, expect, it } from "vitest";
import { isInvalidCurrentValue, isUsableProposedValue } from "./fieldValidity";

describe("isInvalidCurrentValue", () => {
  it("reports a stored email that is not an address", () => {
    expect(isInvalidCurrentValue("person.email", "not-an-address")).toBe(true);
    expect(isInvalidCurrentValue("person.email", "nick@")).toBe(true);
    expect(isInvalidCurrentValue("person.email", "@company.com")).toBe(true);
  });

  // The rule has to be the SAME rule the contact model enforces, or a value passes here and fails
  // at the write, or worse, reaches a custom-mapped target that never sees emailPointSchema.
  it("applies the contact model's length limit, not just the address shape", () => {
    const long = `${"x".repeat(320)}@company.com`;
    expect(isInvalidCurrentValue("person.email", long)).toBe(true);
    expect(isUsableProposedValue("person.email", long)).toBe(false);
  });

  it("accepts a stored email that is an address", () => {
    expect(isInvalidCurrentValue("person.email", "nick@company.com")).toBe(false);
    expect(isInvalidCurrentValue("person.email", "  nick@company.com  ")).toBe(false);
  });

  // An empty field is a gap, not a broken value. The merge already proposes gaps and checks them,
  // so calling them invalid here would say the same thing twice and mislabel the row.
  it("treats an absent value as not invalid", () => {
    expect(isInvalidCurrentValue("person.email", null)).toBe(false);
    expect(isInvalidCurrentValue("person.email", "")).toBe(false);
    expect(isInvalidCurrentValue("person.email", "   ")).toBe(false);
  });

  // Only fields with a rule can fail one. Everything else has no notion of a malformed value, so
  // a stored value is taken at face value and the row keeps its unchecked default.
  it("never calls a field without a validity rule invalid", () => {
    expect(isInvalidCurrentValue("person.title", "!!!")).toBe(false);
    expect(isInvalidCurrentValue("org.domain", "not a domain at all")).toBe(false);
    expect(isInvalidCurrentValue("org.employeeCount", 0)).toBe(false);
  });
});
