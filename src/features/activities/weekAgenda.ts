import type { CalendarActivity } from "./calendar";

const DAY_START_HOUR = 0;
const DAY_END_HOUR = 24;
export const HOUR_HEIGHT_PX = 48;
const MIN_HEIGHT_PX = HOUR_HEIGHT_PX / 2;

export const HOURS: number[] = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR },
  (_, i) => DAY_START_HOUR + i,
);

export const AGENDA_GRID_COLS = "3.25rem repeat(7, minmax(0, 1fr))";
export const AGENDA_GUTTER_WIDTH = "3.25rem";

export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function startTimeLabel(dueAt: Date): string {
  return `${String(dueAt.getHours()).padStart(2, "0")}:${String(dueAt.getMinutes()).padStart(2, "0")}`;
}

export function placeBlock(
  dueAt: Date,
  durationMinutes: number | null,
): { topPx: number; heightPx: number } {
  const minutesFromMidnight = dueAt.getHours() * 60 + dueAt.getMinutes();
  const topPx = (minutesFromMidnight / 60) * HOUR_HEIGHT_PX;
  const heightPx =
    durationMinutes !== null
      ? Math.max((durationMinutes / 60) * HOUR_HEIGHT_PX, MIN_HEIGHT_PX)
      : MIN_HEIGHT_PX;
  return { topPx, heightPx };
}

export function slotDateTime(dayIso: string, hour: number): { date: string; time: string } {
  return { date: dayIso, time: `${String(hour).padStart(2, "0")}:00` };
}

export function localDayIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function groupByLocalDay(
  activities: CalendarActivity[],
  dayIsos: string[],
  includeOverdue = false,
): Map<string, CalendarActivity[]> {
  const map = new Map<string, CalendarActivity[]>();
  for (const iso of dayIsos) map.set(iso, []);
  for (const a of activities) {
    if (!includeOverdue && a.overdue === true) continue;
    const startKey = localDayIso(a.dueAt);
    const endKey = a.endAt != null ? localDayIso(a.endAt) : startKey;
    for (const iso of dayIsos) {
      if (iso >= startKey && iso <= endKey) map.get(iso)?.push(a);
    }
  }
  return map;
}
