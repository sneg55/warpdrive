import { describe, expect, it } from "vitest";
import { mergeLabelOptions } from "./mergeLabelOptions";

describe("mergeLabelOptions", () => {
  it("keeps catalog order and appends names only records carry", () => {
    expect(mergeLabelOptions(["Working", "New"], ["high priority"])).toEqual([
      "Working",
      "New",
      "high priority",
    ]);
  });

  it("treats a differently-cased applied name as the catalog label it resolves to", () => {
    // resolveLabelChips matches the catalog case-insensitively, so "hot" IS "Hot": offering both
    // would put two checkboxes on screen that filter the same records.
    expect(mergeLabelOptions(["Hot"], ["hot"])).toEqual(["Hot"]);
  });

  it("dedupes among the applied names themselves", () => {
    expect(mergeLabelOptions([], ["Urgent", "urgent"])).toEqual(["Urgent"]);
  });

  it("returns the catalog unchanged when nothing extra is applied", () => {
    expect(mergeLabelOptions(["A", "B"], [])).toEqual(["A", "B"]);
  });
});
