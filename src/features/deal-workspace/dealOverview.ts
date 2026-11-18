import { calendarDaysBetween } from "@/lib/calendarDays";

export interface DealOverview {
  ageDays: number;
  inactiveDays: number;
}

export function dealOverview(
  createdAt: Date,
  lastActivityAt: Date | null,
  now: Date,
): DealOverview {
  const ageDays = Math.max(0, calendarDaysBetween(createdAt, now));
  const since = lastActivityAt ?? createdAt;
  const inactiveDays = Math.max(0, calendarDaysBetween(since, now));
  return { ageDays, inactiveDays };
}
