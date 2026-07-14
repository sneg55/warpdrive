import { describe, expect, it } from "vitest";
import { calendarDaysBetween } from "./calendarDays";

describe("calendarDaysBetween", () => {
  it("counts crossed date boundaries, not elapsed 24h periods", () => {
    // ~1.75 * 24h elapsed, but two calendar days crossed.
    const from = new Date(2026, 6, 10, 15, 0, 0);
    const to = new Date(2026, 6, 12, 9, 0, 0);
    expect(calendarDaysBetween(from, to)).toBe(2);
  });

  it("is 0 for two moments on the same calendar day", () => {
    expect(
      calendarDaysBetween(new Date(2026, 6, 10, 1, 0, 0), new Date(2026, 6, 10, 23, 0, 0)),
    ).toBe(0);
  });

  it("is 1 for adjacent days even when barely an hour apart", () => {
    expect(
      calendarDaysBetween(new Date(2026, 6, 10, 23, 30, 0), new Date(2026, 6, 11, 0, 30, 0)),
    ).toBe(1);
  });

  it("is negative when `to` precedes `from`", () => {
    expect(calendarDaysBetween(new Date(2026, 6, 12), new Date(2026, 6, 10))).toBe(-2);
  });
});
