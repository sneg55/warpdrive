import { expect, it } from "vitest";
import type { CalendarActivity } from "./calendar";
import {
  addDaysUtc,
  addMonthsUtc,
  endOfDayUtc,
  groupMonthActivities,
  isSameMonth,
  monthGridDays,
  monthGridRange,
  startOfDayUtc,
} from "./monthGrid";

const iso = (d: Date) => d.toISOString().slice(0, 10);

it("addDaysUtc shifts by whole UTC days", () => {
  expect(iso(addDaysUtc(new Date("2026-06-15T00:00:00Z"), 7))).toBe("2026-06-22");
  expect(iso(addDaysUtc(new Date("2026-06-01T00:00:00Z"), -1))).toBe("2026-05-31");
});

it("addMonthsUtc clamps to the last day of a shorter target month", () => {
  expect(iso(addMonthsUtc(new Date("2026-01-31T00:00:00Z"), 1))).toBe("2026-02-28");
  expect(iso(addMonthsUtc(new Date("2024-01-31T00:00:00Z"), 1))).toBe("2024-02-29"); // leap year
  expect(iso(addMonthsUtc(new Date("2026-03-31T00:00:00Z"), -1))).toBe("2026-02-28");
  expect(iso(addMonthsUtc(new Date("2026-06-15T00:00:00Z"), 1))).toBe("2026-07-15");
});

it("startOfDayUtc / endOfDayUtc bound the UTC day", () => {
  const d = new Date("2026-06-15T13:22:00Z");
  expect(startOfDayUtc(d).toISOString()).toBe("2026-06-15T00:00:00.000Z");
  expect(endOfDayUtc(d).toISOString()).toBe("2026-06-15T23:59:59.999Z");
});

it("monthGridDays returns 42 Monday-first days containing the anchor month", () => {
  // June 2026: June 1 is a Monday, so the grid starts on June 1.
  const days = monthGridDays(new Date("2026-06-15T00:00:00Z"));
  expect(days).toHaveLength(42);
  expect(days[0]?.getUTCDay()).toBe(1); // Monday
  expect(iso(days[0] as Date)).toBe("2026-06-01");
  expect(iso(days[41] as Date)).toBe("2026-07-12"); // trailing days into July
  expect(days.some((d) => iso(d) === "2026-06-15")).toBe(true);
});

it("monthGridDays pads leading days from the previous month", () => {
  // July 2026: July 1 is a Wednesday, so the grid starts Monday June 29.
  const days = monthGridDays(new Date("2026-07-10T00:00:00Z"));
  expect(iso(days[0] as Date)).toBe("2026-06-29");
  expect(days[0]?.getUTCDay()).toBe(1);
  expect(days).toHaveLength(42);
});

it("monthGridRange bounds the first and last grid cells", () => {
  const { from, to } = monthGridRange(new Date("2026-06-15T00:00:00Z"));
  expect(from.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  expect(to.toISOString()).toBe("2026-07-12T23:59:59.999Z");
});

it("isSameMonth is true within the anchor month, false for adjacent-month cells", () => {
  const anchor = new Date("2026-06-15T00:00:00Z");
  expect(isSameMonth(new Date("2026-06-01T00:00:00Z"), anchor)).toBe(true);
  expect(isSameMonth(new Date("2026-07-01T00:00:00Z"), anchor)).toBe(false);
  expect(isSameMonth(new Date("2026-05-31T00:00:00Z"), anchor)).toBe(false);
});

it("groupMonthActivities buckets by due day and KEEPS overdue items", () => {
  const days = monthGridDays(new Date("2026-06-15T00:00:00Z"));
  const mk = (id: string, dueIso: string, overdue: boolean): CalendarActivity => ({
    id,
    subject: id,
    dueAt: new Date(dueIso),
    durationMinutes: null,
    typeKey: "meeting",
    done: false,
    dealId: null,
    personId: null,
    orgId: null,
    overdue,
    ownerName: null,
  });
  const grouped = groupMonthActivities(
    [mk("a", "2026-06-15T10:00:00Z", false), mk("b", "2026-06-15T09:00:00Z", true)],
    days,
  );
  expect(
    grouped
      .get("2026-06-15")
      ?.map((a) => a.id)
      .sort(),
  ).toEqual(["a", "b"]);
});
