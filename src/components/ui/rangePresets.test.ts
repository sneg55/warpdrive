import { describe, expect, it } from "vitest";
import { RANGE_PRESET_KEYS, resolveRangePreset } from "./rangePresets";

const THURSDAY = new Date(2026, 10, 12);

describe("resolveRangePreset", () => {
  it("resolves the Monday-first week containing today", () => {
    expect(resolveRangePreset("this_week", THURSDAY)).toEqual({
      from: "2026-11-09",
      to: "2026-11-15",
    });
  });

  it("treats Sunday as the last day of its week", () => {
    expect(resolveRangePreset("this_week", new Date(2026, 10, 15))).toEqual({
      from: "2026-11-09",
      to: "2026-11-15",
    });
  });

  it("resolves last week", () => {
    expect(resolveRangePreset("last_week", THURSDAY)).toEqual({
      from: "2026-11-02",
      to: "2026-11-08",
    });
  });

  it("resolves this, last and next month to whole calendar months", () => {
    expect(resolveRangePreset("this_month", THURSDAY)).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
    });
    expect(resolveRangePreset("last_month", THURSDAY)).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(resolveRangePreset("next_month", THURSDAY)).toEqual({
      from: "2026-12-01",
      to: "2026-12-31",
    });
  });

  it("crosses year boundaries for last and next month", () => {
    expect(resolveRangePreset("last_month", new Date(2026, 0, 20))).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(resolveRangePreset("next_month", new Date(2026, 11, 3))).toEqual({
      from: "2027-01-01",
      to: "2027-01-31",
    });
  });

  it("ends February on its last day in a leap year", () => {
    expect(resolveRangePreset("next_month", new Date(2028, 0, 31))).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
    });
  });

  it("resolves the calendar quarter and year containing today", () => {
    expect(resolveRangePreset("this_quarter", THURSDAY)).toEqual({
      from: "2026-10-01",
      to: "2026-12-31",
    });
    expect(resolveRangePreset("this_year", THURSDAY)).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });
  });

  it("offers the presets in menu order", () => {
    expect(RANGE_PRESET_KEYS).toEqual([
      "this_week",
      "last_week",
      "this_month",
      "last_month",
      "next_month",
      "this_quarter",
      "this_year",
    ]);
  });
});
