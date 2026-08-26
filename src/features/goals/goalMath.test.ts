import { describe, expect, test } from "vitest";
import { attainment, pace } from "./goalMath";

describe("attainment", () => {
  test("is the booked share of the target", () => {
    expect(attainment("25", "100")).toBe(0.25);
  });

  // Uncapped: a rep at 120% of quota should see 120%, not a bar pinned at full.
  test("goes past 1 when the target is beaten", () => {
    expect(attainment("120", "100")).toBeCloseTo(1.2, 5);
  });

  test("is 0 with nothing booked", () => {
    expect(attainment("0", "100")).toBe(0);
  });

  test("handles money strings with decimals", () => {
    expect(attainment("2500.50", "5001.00")).toBeCloseTo(0.5, 5);
  });

  // A zero target is rejected at the boundary, so reaching here means corrupt data; null is
  // the honest answer rather than Infinity rendered as a percentage.
  test("is null when the target is zero", () => {
    expect(attainment("10", "0")).toBeNull();
  });
});

describe("pace", () => {
  test("is 1 when attainment matches the share of time elapsed", () => {
    expect(pace(0.5, 0.5)).toBe(1);
  });

  test("is above 1 when ahead of schedule", () => {
    expect(pace(0.5, 0.4)).toBeCloseTo(1.25, 5);
  });

  test("is below 1 when behind schedule", () => {
    expect(pace(0.2, 0.5)).toBeCloseTo(0.4, 5);
  });

  test("is null before any of the period has elapsed", () => {
    expect(pace(0, 0)).toBeNull();
  });

  test("is null when attainment could not be computed", () => {
    expect(pace(null, 0.5)).toBeNull();
  });
});
