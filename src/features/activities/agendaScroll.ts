import { splitAllDay } from "./agendaLayout";
import type { CalendarActivity } from "./calendar";

export const DEFAULT_START_HOUR = 8;

export function initialScrollHour(items: CalendarActivity[]): number {
  const { timed } = splitAllDay(items);
  let earliest = DEFAULT_START_HOUR;
  for (const a of timed) earliest = Math.min(earliest, a.dueAt.getHours());
  return Math.max(0, earliest);
}
