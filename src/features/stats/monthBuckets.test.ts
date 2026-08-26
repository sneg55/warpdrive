import { describe, expect, it } from "vitest";
import { MAX_TREND_MONTHS, monthsInRange, windowStart } from "./monthBuckets";

describe("monthsInRange", () => {
  it("returns every month the range touches, inclusive of both ends", () => {
    expect(monthsInRange("2026-01-01", "2026-04-30")).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
    ]);
  });

  it("includes a month the range only partly covers", () => {
    expect(monthsInRange("2026-01-17", "2026-02-03")).toEqual(["2026-01", "2026-02"]);
  });

  it("crosses a year boundary", () => {
    expect(monthsInRange("2025-11-01", "2026-02-01")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("returns the single month a within-month range sits in", () => {
    expect(monthsInRange("2026-03-04", "2026-03-09")).toEqual(["2026-03"]);
  });

  it("returns nothing when the range runs backwards", () => {
    expect(monthsInRange("2026-05-01", "2026-01-01")).toEqual([]);
  });

  // A decade-wide range would draw 120 unreadable ticks, so the series keeps the most recent
  // months rather than the oldest.
  it("caps a very wide range at the most recent months", () => {
    const months = monthsInRange("2000-01-01", "2026-12-31");
    expect(months).toHaveLength(MAX_TREND_MONTHS);
    expect(months[months.length - 1]).toBe("2026-12");
    expect(months[0]).toBe("2022-01");
  });
});

describe("windowStart", () => {
  it("keeps the requested start when nothing was truncated", () => {
    expect(windowStart("2026-01-17", ["2026-01", "2026-02"])).toBe("2026-01-17");
  });

  // When the cap drops leading months, the SQL window has to move with the chart, otherwise
  // the query scans years the chart never draws.
  it("moves to the first rendered month when the cap dropped earlier ones", () => {
    expect(windowStart("2000-01-01", ["2022-01", "2022-02"])).toBe("2022-01-01");
  });

  it("returns null when there is no month to render", () => {
    expect(windowStart("2026-01-01", [])).toBeNull();
  });
});
