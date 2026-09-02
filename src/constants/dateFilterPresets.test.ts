import { describe, expect, it } from "vitest";
import {
  DATE_PRESET_KEYS,
  DATE_PRESET_LABELS,
  isDateConditionValue,
  isDatePreset,
} from "./dateFilterPresets";

describe("dateFilterPresets", () => {
  it("offers the relative periods a next or last activity filter needs", () => {
    expect(DATE_PRESET_KEYS).toEqual([
      "today",
      "yesterday",
      "tomorrow",
      "this_week",
      "last_week",
      "next_week",
      "this_month",
      "last_month",
      "next_month",
      "last_7_days",
      "next_7_days",
      "last_30_days",
      "next_30_days",
    ]);
  });

  it("labels every preset", () => {
    for (const key of DATE_PRESET_KEYS) expect(DATE_PRESET_LABELS[key].length).toBeGreaterThan(0);
    expect(DATE_PRESET_LABELS.last_7_days).toBe("Last 7 days");
  });

  it("recognises a preset key and nothing else", () => {
    expect(isDatePreset("today")).toBe(true);
    expect(isDatePreset("2026-09-02")).toBe(false);
    expect(isDatePreset("Today")).toBe(false);
  });

  it("accepts a preset or a real YYYY-MM-DD calendar date as a condition value", () => {
    expect(isDateConditionValue("last_week")).toBe(true);
    expect(isDateConditionValue("2026-09-02")).toBe(true);
    expect(isDateConditionValue("2024-02-29")).toBe(true);
    expect(isDateConditionValue("2026-02-30")).toBe(false);
    expect(isDateConditionValue("0000-01-01")).toBe(false);
    expect(isDateConditionValue("2026-13-01")).toBe(false);
    expect(isDateConditionValue("2026-9-2")).toBe(false);
    expect(isDateConditionValue("09/02/2026")).toBe(false);
    expect(isDateConditionValue("soon")).toBe(false);
  });
});
