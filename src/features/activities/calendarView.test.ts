import { expect, it } from "vitest";
import {
  monthTitle,
  parseCalendarParams,
  selectWindow,
  stepAnchorIso,
  weekTitle,
} from "./calendarView";

it("weekTitle carries the month and year so navigation stays oriented", () => {
  expect(weekTitle("2026-06-15")).toBe("Jun 15, 2026");
  expect(weekTitle("2027-01-04")).toBe("Jan 4, 2027");
});

const TODAY = new Date("2026-07-03T12:00:00Z");

it("defaults to week + today when params are absent", () => {
  expect(parseCalendarParams({}, TODAY)).toEqual({ view: "week", anchorIso: "2026-07-03" });
});

it("accepts valid view and anchor", () => {
  expect(parseCalendarParams({ view: "month", d: "2026-06-15" }, TODAY)).toEqual({
    view: "month",
    anchorIso: "2026-06-15",
  });
});

it("falls back to defaults on invalid params (E6), never throws", () => {
  expect(parseCalendarParams({ view: "foo", d: "not-a-date" }, TODAY)).toEqual({
    view: "week",
    anchorIso: "2026-07-03",
  });
  expect(parseCalendarParams({ d: "2026-13-40" }, TODAY).anchorIso).toBe("2026-07-03");
});

it("selectWindow: week range ends at end-of-day Sunday (E2 fix)", () => {
  const { days, range } = selectWindow("week", "2026-07-03"); // week Mon Jun 29 .. Sun Jul 5
  expect(days).toHaveLength(7);
  expect(days[0]?.toISOString().slice(0, 10)).toBe("2026-06-29");
  expect(range.from.toISOString()).toBe("2026-06-29T00:00:00.000Z");
  expect(range.to.toISOString()).toBe("2026-07-05T23:59:59.999Z");
});

it("selectWindow: month range covers the full 42-cell grid", () => {
  const { days, range } = selectWindow("month", "2026-06-15");
  expect(days).toHaveLength(42);
  expect(range.from.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  expect(range.to.toISOString()).toBe("2026-07-12T23:59:59.999Z");
});

it("stepAnchorIso: week steps by 7 days, month by one clamped month", () => {
  expect(stepAnchorIso("week", "2026-07-03", 1)).toBe("2026-07-10");
  expect(stepAnchorIso("week", "2026-07-03", -1)).toBe("2026-06-26");
  expect(stepAnchorIso("month", "2026-01-31", 1)).toBe("2026-02-28");
  expect(stepAnchorIso("month", "2026-06-15", -1)).toBe("2026-05-15");
});

it("monthTitle formats the anchor month in UTC", () => {
  expect(monthTitle("2026-06-15")).toBe("June 2026");
  expect(monthTitle("2026-12-01")).toBe("December 2026");
});
