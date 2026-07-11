// Pure month-grid helpers for the in-app calendar. UTC-based and Monday-first so
// the grid is deterministic regardless of the server/browser timezone. Mirrors
// weekGrid.ts. Unlike groupByDay, groupMonthActivities keeps overdue items: the
// month grid has no side rail, so overdue activities render in their due-date cell.
import type { CalendarActivity } from "./calendar";
import { groupByDay } from "./weekGrid";

export function addDaysUtc(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

// Shift by whole months, clamping the day-of-month to the target month's length
// (Jan 31 + 1mo -> Feb 28/29) so navigation never rolls into the following month.
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

// Monday that begins the 6-week grid containing monthOf's first day.
function gridStart(monthOf: Date): Date {
  const first = new Date(Date.UTC(monthOf.getUTCFullYear(), monthOf.getUTCMonth(), 1));
  const dow = first.getUTCDay(); // 0=Sun..6=Sat
  return addDaysUtc(first, dow === 0 ? -6 : 1 - dow);
}

// Always 42 cells (6 weeks x 7) so grid height is stable across months.
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

// Same day-bucketing as the week grid, but keeping overdue items: the month grid has no
// side rail, so overdue activities render in their due-date cell.
export function groupMonthActivities(
  activities: CalendarActivity[],
  days: Date[],
): Map<string, CalendarActivity[]> {
  return groupByDay(activities, days, true);
}
