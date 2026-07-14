import { calendarDaysBetween } from "@/lib/calendarDays";

export interface DealOverview {
  ageDays: number; // days since the deal was created
  inactiveDays: number; // days since the last activity (falls back to age when never active)
}

// Pure overview metrics for the deal detail "Overview" section (Pipedrive: Deal age + Inactive
// days). inactiveDays measures staleness: time since the last logged activity, or the deal's full
// age if it never had one.
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
