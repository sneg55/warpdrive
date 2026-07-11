import type { CalendarActivity } from "./calendar";

export const DAY_START_HOUR = 0;
export const DAY_END_HOUR = 24;
export const HOUR_HEIGHT_PX = 48;
const MIN_HEIGHT_PX = HOUR_HEIGHT_PX / 2;

// Vertical placement of a timed activity block in the hourly week grid. Uses the viewer's
// local hours (dueAt is a Date; the grid is a local-time agenda). Placement is purely a
// function of the activity's own dueAt/duration: it does not resolve overlap against other
// activities (no horizontal lane assignment). Two activities whose time ranges overlap are
// placed independently and may render stacked; WeekAgendaGrid, not this module, owns any
// visual layering (z-index) for that case.
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

// Prefill values for click-to-create in a given day column + hour lane.
export function slotDateTime(dayIso: string, hour: number): { date: string; time: string } {
  return { date: dayIso, time: `${String(hour).padStart(2, "0")}:00` };
}

// Local (viewer wall-clock) day key for a Date, as "YYYY-MM-DD". This is the LOCAL-time
// counterpart to weekGrid.ts's isoDay (UTC): the week agenda is a client-rendered, interactive
// grid whose hour lane (placeBlock, above) already reads local hours/minutes, so its DAY bucket
// must resolve in that same local frame. weekGrid.isoDay stays UTC-only for MonthView, which is
// deliberately server-timezone-deterministic; do not merge the two.
export function localDayIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Bucket activities into their LOCAL due-day. Mirrors weekGrid.groupByDay's shape, but dayIsos
// are taken as-is for the bucket keys (they are already the calendar's own local-frame day
// strings), so no Date round-trip through isoDay is needed for the keys themselves; only each
// activity's own dueAt needs the local-day conversion.
export function groupByLocalDay(
  activities: CalendarActivity[],
  dayIsos: string[],
  includeOverdue = false,
): Map<string, CalendarActivity[]> {
  const map = new Map<string, CalendarActivity[]>();
  for (const iso of dayIsos) map.set(iso, []);
  for (const a of activities) {
    if (!includeOverdue && a.overdue === true) continue;
    // Multi-day activities (endAt set) span every local day in [dueAt, endAt]; local "YYYY-MM-DD"
    // strings compare lexically as dates. Single-day activities keep their one-day behavior.
    const startKey = localDayIso(a.dueAt);
    const endKey = a.endAt != null ? localDayIso(a.endAt) : startKey;
    for (const iso of dayIsos) {
      if (iso >= startKey && iso <= endKey) map.get(iso)?.push(a);
    }
  }
  return map;
}
