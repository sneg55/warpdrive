import type { CalendarActivity } from "./calendar";

export interface GroupedActivities {
  overdue: CalendarActivity[];
  today: CalendarActivity[];
  upcoming: CalendarActivity[];
}

// UTC calendar-day key, so grouping is deterministic regardless of runtime tz.
function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// Partition activities into the buckets Pipedrive's activity list uses: Overdue
// (undone, before today), Today, and Upcoming. Completed past activities are
// dropped so they do not clutter the to-do list. Each bucket is sorted by due
// time ascending.
export function groupActivities(items: CalendarActivity[], now: number): GroupedActivities {
  const todayKey = dayKey(now);
  const out: GroupedActivities = { overdue: [], today: [], upcoming: [] };

  for (const a of items) {
    const key = dayKey(a.dueAt.getTime());
    if (key === todayKey) {
      out.today.push(a);
    } else if (key < todayKey) {
      if (a.done === false) out.overdue.push(a);
      // completed past activities are intentionally dropped
    } else {
      out.upcoming.push(a);
    }
  }

  const byDue = (x: CalendarActivity, y: CalendarActivity) => x.dueAt.getTime() - y.dueAt.getTime();
  out.overdue.sort(byDue);
  out.today.sort(byDue);
  out.upcoming.sort(byDue);
  return out;
}
