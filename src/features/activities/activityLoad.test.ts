import { describe, expect, it } from "vitest";
import { DEFAULT_DAILY_ACTIVITY_TARGET } from "@/constants/activityLoad";
import { activityLoadLevel } from "./activityLoad";

describe("activityLoadLevel", () => {
  it("reads an empty day as 'none' whatever the target", () => {
    expect(activityLoadLevel(0, 5)).toBe("none");
    expect(activityLoadLevel(0, 1)).toBe("none");
    expect(activityLoadLevel(0, 50)).toBe("none");
  });

  it("reads below 0.6 of the target as 'light'", () => {
    expect(activityLoadLevel(1, 5)).toBe("light");
    expect(activityLoadLevel(2, 5)).toBe("light");
  });

  it("puts the 0.6 boundary itself in 'near', not 'light'", () => {
    // 0.6 * 5 = 3 exactly: the light band is open at the top.
    expect(activityLoadLevel(3, 5)).toBe("near");
  });

  it("reads between 0.6 of the target and the target as 'near'", () => {
    expect(activityLoadLevel(4, 5)).toBe("near");
    expect(activityLoadLevel(9, 10)).toBe("near");
  });

  it("reads the target itself and anything past it as 'full'", () => {
    expect(activityLoadLevel(5, 5)).toBe("full");
    expect(activityLoadLevel(6, 5)).toBe("full");
    expect(activityLoadLevel(99, 5)).toBe("full");
  });

  it("handles a target whose 0.6 share is not a whole number", () => {
    // 0.6 * 3 = 1.8
    expect(activityLoadLevel(1, 3)).toBe("light");
    expect(activityLoadLevel(2, 3)).toBe("near");
    expect(activityLoadLevel(3, 3)).toBe("full");
    // 0.6 * 7 = 4.2
    expect(activityLoadLevel(4, 7)).toBe("light");
    expect(activityLoadLevel(5, 7)).toBe("near");
  });

  it("still separates the bands at the smallest allowed target", () => {
    // 0.6 * 1 = 0.6, so no count can land in "light".
    expect(activityLoadLevel(1, 1)).toBe("full");
  });

  it("falls back to the default target when the target is zero or negative", () => {
    expect(activityLoadLevel(4, 0)).toBe(activityLoadLevel(4, DEFAULT_DAILY_ACTIVITY_TARGET));
    expect(activityLoadLevel(4, 0)).toBe("near");
    expect(activityLoadLevel(2, -10)).toBe("light");
    expect(activityLoadLevel(5, 0)).toBe("full");
  });

  it("falls back to the default target when the target is not finite", () => {
    expect(activityLoadLevel(4, Number.NaN)).toBe("near");
    expect(activityLoadLevel(4, Number.POSITIVE_INFINITY)).toBe("near");
    expect(activityLoadLevel(2, Number.NEGATIVE_INFINITY)).toBe("light");
  });
});
