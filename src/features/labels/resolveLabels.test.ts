import { describe, expect, it } from "vitest";
import { LABEL_COLOR_CLASSES, LABEL_COLOR_HEX } from "@/constants/labelColors";
import { resolveLabelChips, resolveLabelColors } from "./resolveLabels";

const catalog = [
  { name: "Hot", color: "red" as const },
  { name: "Decision Maker", color: "purple" as const },
];

describe("resolveLabelChips", () => {
  it("resolves an applied name to the catalog color's chip classes", () => {
    const chips = resolveLabelChips(catalog, ["Hot"]);
    expect(chips).toEqual([{ name: "Hot", classes: LABEL_COLOR_CLASSES.red }]);
  });

  it("matches case-insensitively so a legacy lowercase key resolves to the catalog label", () => {
    // Existing entities stored keys like "hot"; the catalog name is "Hot". The stored string is
    // preserved for display fidelity but the color comes from the case-insensitive catalog match.
    const chips = resolveLabelChips(catalog, ["hot"]);
    expect(chips).toEqual([{ name: "hot", classes: LABEL_COLOR_CLASSES.red }]);
  });

  it("preserves the order the labels were applied in, not the catalog order", () => {
    const chips = resolveLabelChips(catalog, ["Decision Maker", "Hot"]);
    expect(chips.map((c) => c.name)).toEqual(["Decision Maker", "Hot"]);
  });

  it("falls back to a neutral gray chip for a name not in the catalog", () => {
    const chips = resolveLabelChips(catalog, ["Ghost"]);
    expect(chips).toEqual([{ name: "Ghost", classes: LABEL_COLOR_CLASSES.gray }]);
  });

  it("returns no chips for an empty applied list", () => {
    expect(resolveLabelChips(catalog, [])).toEqual([]);
  });
});

describe("resolveLabelColors", () => {
  it("resolves applied names to the catalog color's hex (for solid inline chips)", () => {
    expect(resolveLabelColors(catalog, ["Hot"])).toEqual([
      { name: "Hot", color: LABEL_COLOR_HEX.red },
    ]);
  });

  it("matches case-insensitively and falls back to gray hex for unknown names", () => {
    expect(resolveLabelColors(catalog, ["hot", "Ghost"])).toEqual([
      { name: "hot", color: LABEL_COLOR_HEX.red },
      { name: "Ghost", color: LABEL_COLOR_HEX.gray },
    ]);
  });
});
