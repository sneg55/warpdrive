import { describe, expect, it } from "vitest";
import { type ActivityDatePreset, activePreset, presetRange } from "./activityDatePresets";

// Local-day formatter mirroring the filter's YYYY-MM-DD bounds.
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// A Wednesday, chosen so "this week" is unambiguously mid-week.
const TODAY = new Date(2026, 6, 8); // 2026-07-08

describe("presetRange", () => {
  it("today: both bounds are today", () => {
    expect(presetRange("today", TODAY)).toEqual({ from: "2026-07-08", to: "2026-07-08" });
  });

  it("overdue: everything up to and including yesterday, no lower bound", () => {
    expect(presetRange("overdue", TODAY)).toEqual({ from: null, to: "2026-07-07" });
  });

  it("to-do: clears the date range", () => {
    expect(presetRange("todo", TODAY)).toEqual({ from: null, to: null });
  });

  it("this week: a Monday-first 7-day span containing today", () => {
    const { from, to } = presetRange("this_week", TODAY);
    expect(from).not.toBeNull();
    expect(to).not.toBeNull();
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    expect(start.getDay()).toBe(1); // Monday
    expect(end.getDay()).toBe(0); // Sunday
    expect(Math.round((end.getTime() - start.getTime()) / 86_400_000)).toBe(6);
    expect(ymd(start) <= ymd(TODAY) && ymd(TODAY) <= ymd(end)).toBe(true);
  });
});

describe("activePreset", () => {
  const presets: ActivityDatePreset[] = ["overdue", "today", "this_week", "todo"];
  for (const p of presets) {
    it(`round-trips ${p}`, () => {
      const r = presetRange(p, TODAY);
      // "todo" clears the range, which also matches the default empty filter; every other
      // preset must resolve back to exactly itself.
      expect(activePreset(r, TODAY)).toBe(p);
    });
  }

  it("returns null for an arbitrary custom range", () => {
    expect(activePreset({ from: "2026-01-01", to: "2026-01-15" }, TODAY)).toBeNull();
  });
});
