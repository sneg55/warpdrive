// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildMailLabelIndex, resolveMailLabelChips } from "./mailLabelResolve";

const catalog = [
  { key: "important", name: "Important", color: "red" as const },
  { key: "to_do", name: "To do", color: "orange" as const },
  { key: "newsletter", name: "Newsletter", color: "green" as const },
];

describe("resolveMailLabelChips", () => {
  it("maps applied keys to catalog name + color classes, preserving order", () => {
    const chips = resolveMailLabelChips(catalog, ["newsletter", "important"]);
    expect(chips.map((c) => c.name)).toEqual(["Newsletter", "Important"]);
    expect(chips[0]?.classes).toContain("bg-green-100");
    expect(chips[1]?.classes).toContain("bg-red-100");
  });

  it("matches keys case-insensitively", () => {
    const chips = resolveMailLabelChips(catalog, ["IMPORTANT"]);
    expect(chips.map((c) => c.name)).toEqual(["Important"]);
  });

  it("skips keys with no catalog entry", () => {
    const chips = resolveMailLabelChips(catalog, ["important", "ghost"]);
    expect(chips.map((c) => c.name)).toEqual(["Important"]);
  });

  it("returns an empty list for no applied keys", () => {
    expect(resolveMailLabelChips(catalog, [])).toEqual([]);
  });

  it("reuses one index per catalog reference so the inbox does not rebuild it per row", () => {
    // The inbox renders one ThreadLabelChips per thread, all sharing the same catalog array; the
    // index must be built once and shared, not rebuilt O(threads) times.
    expect(buildMailLabelIndex(catalog)).toBe(buildMailLabelIndex(catalog));
    // A different catalog array gets its own index.
    expect(buildMailLabelIndex(catalog)).not.toBe(buildMailLabelIndex([...catalog]));
  });
});
