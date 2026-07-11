// Pure week-grid helpers for the in-app calendar. UTC-based and Monday-first so the
// grid is deterministic regardless of the server/browser timezone. Activities flagged
// overdue are excluded from the day buckets (they live in the Overdue rail instead).
import type { CalendarActivity } from "./calendar";

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function weekDays(weekOf: Date): Date[] {
  const d = new Date(Date.UTC(weekOf.getUTCFullYear(), weekOf.getUTCMonth(), weekOf.getUTCDate()));
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + i);
    return day;
  });
}

// Bucket activities by UTC due-day. By default overdue items are skipped (the week view's
// Overdue rail owned them); pass includeOverdue=true to place them on their due-day cell,
// which the month view and navigable week grid need so historical days are not left empty.
export function groupByDay(
  activities: CalendarActivity[],
  days: Date[],
  includeOverdue = false,
): Map<string, CalendarActivity[]> {
  const map = new Map<string, CalendarActivity[]>();
  for (const day of days) map.set(isoDay(day), []);
  for (const a of activities) {
    if (!includeOverdue && a.overdue === true) continue;
    // A multi-day activity (endAt set) covers every day in [dueAt, endAt]; a single-day one covers
    // just its own day. isoDay strings are "YYYY-MM-DD", so lexical compare is date compare.
    const startKey = isoDay(a.dueAt);
    const endKey = a.endAt != null ? isoDay(a.endAt) : startKey;
    for (const day of days) {
      const key = isoDay(day);
      if (key >= startKey && key <= endKey) map.get(key)?.push(a);
    }
  }
  return map;
}

export function overdueItems(activities: CalendarActivity[]): CalendarActivity[] {
  return activities.filter((a) => a.overdue === true);
}
