import { describe, expect, test } from "vitest";
import { currentPeriod, elapsedFraction, periodDays } from "./goalPeriod";

describe("currentPeriod", () => {
  test("a weekly goal runs seven days from its start", () => {
    expect(currentPeriod("weekly", "2026-03-02", null, "2026-03-04")).toEqual({
      start: "2026-03-02",
      end: "2026-03-08",
    });
  });

  test("a weekly goal rolls to the next window once the first ends", () => {
    expect(currentPeriod("weekly", "2026-03-02", null, "2026-03-09")).toEqual({
      start: "2026-03-09",
      end: "2026-03-15",
    });
  });

  test("a monthly goal is anchored on its start day, not the calendar month", () => {
    expect(currentPeriod("monthly", "2026-02-15", null, "2026-03-01")).toEqual({
      start: "2026-02-15",
      end: "2026-03-14",
    });
  });

  test("a quarterly goal starting in February runs February to April", () => {
    expect(currentPeriod("quarterly", "2026-02-01", null, "2026-03-10")).toEqual({
      start: "2026-02-01",
      end: "2026-04-30",
    });
  });

  test("a yearly goal spans a full year from its start", () => {
    expect(currentPeriod("yearly", "2026-02-01", null, "2026-09-09")).toEqual({
      start: "2026-02-01",
      end: "2027-01-31",
    });
  });

  // Adding a month to the 31st has no 31st to land on in February; clamping to the last day
  // is the only answer that keeps periods contiguous with no gap or overlap.
  test("a monthly goal starting on the 31st ends the day before the clamped next start", () => {
    expect(currentPeriod("monthly", "2026-01-31", null, "2026-02-10")).toEqual({
      start: "2026-01-31",
      end: "2026-02-27",
    });
  });

  test("the period after a clamped boundary starts on the clamped day", () => {
    expect(currentPeriod("monthly", "2026-01-31", null, "2026-03-01")).toEqual({
      start: "2026-02-28",
      end: "2026-03-30",
    });
  });

  test("is null before the goal starts", () => {
    expect(currentPeriod("monthly", "2026-06-01", null, "2026-05-31")).toBeNull();
  });

  test("is null after the goal ends", () => {
    expect(currentPeriod("monthly", "2026-01-01", "2026-03-31", "2026-06-01")).toBeNull();
  });

  test("still resolves on the final day of an ended goal", () => {
    expect(currentPeriod("monthly", "2026-01-01", "2026-03-31", "2026-03-31")).toEqual({
      start: "2026-03-01",
      end: "2026-03-31",
    });
  });

  test("clips the last period to the goal's end date", () => {
    expect(currentPeriod("monthly", "2026-01-01", "2026-03-15", "2026-03-10")).toEqual({
      start: "2026-03-01",
      end: "2026-03-15",
    });
  });
});

describe("elapsedFraction", () => {
  test("is a small share on the first day of a long period", () => {
    // Day 1 of 31 counts as one day done, not zero, so pace is defined immediately.
    expect(elapsedFraction({ start: "2026-01-01", end: "2026-01-31" }, "2026-01-01")).toBeCloseTo(
      1 / 31,
      5,
    );
  });

  test("is 1 on the last day of the period", () => {
    expect(elapsedFraction({ start: "2026-01-01", end: "2026-01-31" }, "2026-01-31")).toBe(1);
  });

  test("is about half at the midpoint", () => {
    expect(elapsedFraction({ start: "2026-01-01", end: "2026-01-10" }, "2026-01-05")).toBeCloseTo(
      0.5,
      5,
    );
  });

  test("never exceeds 1 for a day past the period", () => {
    expect(elapsedFraction({ start: "2026-01-01", end: "2026-01-10" }, "2026-02-01")).toBe(1);
  });

  test("is 0 for a day before the period", () => {
    expect(elapsedFraction({ start: "2026-01-10", end: "2026-01-20" }, "2026-01-01")).toBe(0);
  });
});

describe("periodDays", () => {
  test("lists every day of the period, both ends included", () => {
    expect(periodDays({ start: "2026-01-01", end: "2026-01-04" })).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
    ]);
  });

  test("spans a month boundary", () => {
    expect(periodDays({ start: "2026-01-30", end: "2026-02-02" })).toEqual([
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
      "2026-02-02",
    ]);
  });

  test("is a single day when the period is one day long", () => {
    expect(periodDays({ start: "2026-01-01", end: "2026-01-01" })).toEqual(["2026-01-01"]);
  });
});
