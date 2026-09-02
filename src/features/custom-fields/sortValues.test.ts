import { describe, expect, it } from "vitest";
import type { CustomFieldDef } from "@/types/customFields";
import { compareCustomFieldValues, customFieldSortValue, optionRank } from "./sortValues";

function def(over: Partial<CustomFieldDef>): CustomFieldDef {
  return {
    id: "d",
    targetEntity: "deal",
    type: "text",
    name: "F",
    key: "f",
    options: [],
    isRequired: false,
    isImportant: false,
    showInAddForm: false,
    order: 0,
    archivedAt: null,
    ...over,
  };
}

const optionDef = def({
  type: "single_option",
  options: [
    { id: "hi", label: "High" },
    { id: "old", label: "Old", archived: true },
    { id: "lo", label: "Low" },
  ],
});

describe("customFieldSortValue", () => {
  it("lower-cases text and returns null for empty", () => {
    expect(customFieldSortValue(def({}), "Zeta")).toBe("zeta");
    expect(customFieldSortValue(def({}), "")).toBeNull();
    expect(customFieldSortValue(def({}), undefined)).toBeNull();
  });
  it("returns numbers as numbers and rejects a stored string in a numeric field", () => {
    expect(customFieldSortValue(def({ type: "numeric" }), 5)).toBe(5);
    expect(customFieldSortValue(def({ type: "monetary" }), "5")).toBeNull();
  });
  it("keeps ISO date and time strings", () => {
    expect(customFieldSortValue(def({ type: "date" }), "2026-01-02")).toBe("2026-01-02");
  });
  it("ranks live options in def order and archived ones after", () => {
    expect(optionRank(optionDef, "hi")).toBe(0);
    expect(optionRank(optionDef, "lo")).toBe(1);
    expect(optionRank(optionDef, "old")).toBe(2);
    expect(optionRank(optionDef, "ghost")).toBeNull();
    expect(customFieldSortValue(optionDef, "lo")).toBe(1);
  });
  it("returns null for unsortable types", () => {
    expect(customFieldSortValue(def({ type: "multi_option" }), ["hi"])).toBeNull();
  });
});

describe("compareCustomFieldValues", () => {
  const text = def({});
  it("orders asc and desc among present values", () => {
    expect(compareCustomFieldValues(text, "a", "b", "asc")).toBeLessThan(0);
    expect(compareCustomFieldValues(text, "a", "b", "desc")).toBeGreaterThan(0);
  });
  it("puts empties last in both directions", () => {
    expect(compareCustomFieldValues(text, null, "b", "asc")).toBeGreaterThan(0);
    expect(compareCustomFieldValues(text, null, "b", "desc")).toBeGreaterThan(0);
    expect(compareCustomFieldValues(text, "b", null, "desc")).toBeLessThan(0);
    expect(compareCustomFieldValues(text, null, null, "asc")).toBe(0);
  });
  it("compares numerics numerically", () => {
    const n = def({ type: "numeric" });
    expect(compareCustomFieldValues(n, 9, 10, "asc")).toBeLessThan(0);
  });
});
