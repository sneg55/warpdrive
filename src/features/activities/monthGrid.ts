import type { CalendarActivity } from "./calendar";
import { groupByDay } from "./weekGrid";

export function addDaysUtc(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

export function addMonthsUtc(d: Date, delta: number): Date {
  const firstOfTarget = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1));
  const y = firstOfTarget.getUTCFullYear();
  const m = firstOfTarget.getUTCMonth();
  const daysInTarget = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(d.getUTCDate(), daysInTarget);
  return new Date(Date.UTC(y, m, day));
}

export function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

export function endOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

function gridStart(monthOf: Date): Date {
  const first = new Date(Date.UTC(monthOf.getUTCFullYear(), monthOf.getUTCMonth(), 1));
  const dow = first.getUTCDay();
  return addDaysUtc(first, dow === 0 ? -6 : 1 - dow);
}

export function monthGridDays(monthOf: Date): Date[] {
  const start = gridStart(monthOf);
  return Array.from({ length: 42 }, (_, i) => addDaysUtc(start, i));
}

export function monthGridRange(monthOf: Date): { from: Date; to: Date } {
  const start = gridStart(monthOf);
  return { from: startOfDayUtc(start), to: endOfDayUtc(addDaysUtc(start, 41)) };
}

export function isSameMonth(day: Date, monthOf: Date): boolean {
  return (
    day.getUTCFullYear() === monthOf.getUTCFullYear() && day.getUTCMonth() === monthOf.getUTCMonth()
  );
}

export function groupMonthActivities(
  activities: CalendarActivity[],
  days: Date[],
): Map<string, CalendarActivity[]> {
  return groupByDay(activities, days, true);
}
