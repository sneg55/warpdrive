import { describe, expect, it } from "vitest";
import { stageSubtitle } from "./boardColumnSubtitle";

describe("stageSubtitle", () => {
  it("names the count alongside the value", () => {
    expect(stageSubtitle("$232,000", 7)).toBe("$232,000 · 7 deals");
  });

  it("keeps the count when a column is empty", () => {
    expect(stageSubtitle("$0", 0)).toBe("$0 · 0 deals");
  });

  it("uses the singular for one deal", () => {
    expect(stageSubtitle("$8,000", 1)).toBe("$8,000 · 1 deal");
  });
});
