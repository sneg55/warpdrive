import { describe, expect, it } from "vitest";
import type { CustomFieldDef } from "@/types/customFields";
import { formatCustomFieldDisplay, isCustomFieldValueEmpty } from "./render";

const def = (over: Partial<CustomFieldDef>): CustomFieldDef => ({
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
});

describe("formatCustomFieldDisplay", () => {
  it("renders a single_option as its label, not the id", () => {
    const d = def({ type: "single_option", options: [{ id: "opt_a", label: "SaaS" }] });
    expect(formatCustomFieldDisplay(d, "opt_a")).toBe("SaaS");
  });
  it("renders multi_option as a joined label list", () => {
    const d = def({
      type: "multi_option",
      options: [
        { id: "a", label: "X" },
        { id: "b", label: "Y" },
      ],
    });
    expect(formatCustomFieldDisplay(d, ["a", "b"])).toBe("X, Y");
  });
  it('renders a date_range with a "to" separator', () => {
    const d = def({ type: "date_range" });
    expect(formatCustomFieldDisplay(d, { start: "2026-07-01", end: "2026-07-05" })).toBe(
      "2026-07-01 to 2026-07-05",
    );
  });
  it("renders an empty value as an em-dash-free placeholder", () => {
    expect(formatCustomFieldDisplay(def({}), undefined)).toBe("(empty)");
  });
});

describe("isCustomFieldValueEmpty", () => {
  it("is true for undefined, null, an empty string, and an empty array", () => {
    expect(isCustomFieldValueEmpty(undefined)).toBe(true);
    expect(isCustomFieldValueEmpty(null)).toBe(true);
    expect(isCustomFieldValueEmpty("")).toBe(true);
    expect(isCustomFieldValueEmpty([])).toBe(true);
  });

  it("is false for a real value", () => {
    expect(isCustomFieldValueEmpty("SaaS")).toBe(false);
    expect(isCustomFieldValueEmpty(0)).toBe(false);
    expect(isCustomFieldValueEmpty(["a"])).toBe(false);
  });
});
