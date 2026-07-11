import { describe, expect, it } from "vitest";
import { midpoint } from "./boardPosition";

describe("midpoint", () => {
  it("returns 1 for an empty column", () => {
    expect(midpoint(null, null)).toBe("1");
  });
  it("returns before+1 when dropping at the bottom", () => {
    expect(midpoint("4", null)).toBe("5");
  });
  it("returns half of after when dropping at the top", () => {
    expect(midpoint(null, "4")).toBe("2");
  });
  it("returns the midpoint between two neighbors", () => {
    expect(midpoint("2", "4")).toBe("3");
  });
  it("produces a fractional value when neighbors are adjacent", () => {
    expect(midpoint("2", "3")).toBe("2.5");
  });
});
