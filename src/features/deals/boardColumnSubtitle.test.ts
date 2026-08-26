import { describe, expect, it } from "vitest";
import { stageSubtitle } from "./boardColumnSubtitle";

// A filtered board drops its columns to "$0" with the count suppressed, so the line changes
// shape exactly when the rep most needs to read it as a real answer rather than a blank.
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
