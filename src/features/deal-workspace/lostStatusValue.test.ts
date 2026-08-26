import { describe, expect, it } from "vitest";
import { asLostStatusValue, lostStatusValue } from "./lostStatusValue";

describe("lostStatusValue", () => {
  it("collapses to the plain status string when there is neither reason nor comment", () => {
    expect(lostStatusValue(null, null)).toBe("lost");
    expect(lostStatusValue("", "  ")).toBe("lost");
  });

  it("carries the resolved reason name and the free-text comment", () => {
    expect(lostStatusValue("Bad timing", "my bad, this was old")).toEqual({
      value: "lost",
      reason: "Bad timing",
      comment: "my bad, this was old",
    });
  });

  it("carries one side alone", () => {
    expect(lostStatusValue("Bad timing", null)).toEqual({
      value: "lost",
      reason: "Bad timing",
      comment: null,
    });
    expect(lostStatusValue(null, "no budget")).toEqual({
      value: "lost",
      reason: null,
      comment: "no budget",
    });
  });
});

describe("asLostStatusValue", () => {
  it("parses a structured lost value", () => {
    expect(asLostStatusValue({ value: "lost", reason: "Bad timing", comment: null })).toEqual({
      value: "lost",
      reason: "Bad timing",
      comment: null,
    });
  });

  it("returns null for the legacy plain string and for unrelated shapes", () => {
    expect(asLostStatusValue("lost")).toBeNull();
    expect(asLostStatusValue("won")).toBeNull();
    expect(asLostStatusValue(null)).toBeNull();
    expect(asLostStatusValue({ value: "won", reason: "x", comment: null })).toBeNull();
    expect(asLostStatusValue({ value: "x", providers: ["apollo"] })).toBeNull();
  });
});
