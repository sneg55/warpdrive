import type { CalendarActivity } from "./calendar";

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function weekDays(weekOf: Date): Date[] {
  const d = new Date(Date.UTC(weekOf.getUTCFullYear(), weekOf.getUTCMonth(), weekOf.getUTCDate()));
  const dow = d.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + i);
    return day;
  });
}

export function groupByDay(
  activities: CalendarActivity[],
  days: Date[],
  includeOverdue = false,
): Map<string, CalendarActivity[]> {
  const map = new Map<string, CalendarActivity[]>();
  for (const day of days) map.set(isoDay(day), []);
  for (const a of activities) {
    if (!includeOverdue && a.overdue === true) continue;
    const startKey = isoDay(a.dueAt);
    const endKey = a.endAt != null ? isoDay(a.endAt) : startKey;
    for (const day of days) {
      const key = isoDay(day);
      if (key >= startKey && key <= endKey) map.get(key)?.push(a);
    }
  }
  return map;
}
