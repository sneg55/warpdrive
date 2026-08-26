import { splitAllDay } from "./agendaLayout";
import type { CalendarActivity } from "./calendar";

// The hour the week agenda opens on. A 24-hour column that starts at midnight shows an empty grid
// with the working day below the fold, which is how a full week reads as an empty one.
export const DEFAULT_START_HOUR = 8;

// Where to park the hour grid's scroll on first paint: the working day, or earlier if the day
// starts earlier. All-day activities are stored at midnight and live in their own lane, so they
// must not drag the view up to 00:00.
export function initialScrollHour(items: CalendarActivity[]): number {
  const { timed } = splitAllDay(items);
  let earliest = DEFAULT_START_HOUR;
  for (const a of timed) earliest = Math.min(earliest, a.dueAt.getHours());
  return Math.max(0, earliest);
}
