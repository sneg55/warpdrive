// Pipedrive-parity next-activity cell state, computed against the client clock so the row reflects
// the viewer's local day. 'none' -> warning icon + "No activity"; 'overdue' -> red; 'today'/
// 'upcoming' -> the date. Server filters use the same buckets (leadListInput nextActivity).
export type NextActivityState = "none" | "overdue" | "today" | "upcoming";

export function nextActivityState(at: Date | string | null, now: Date): NextActivityState {
  if (at === null) return "none";
  const due = typeof at === "string" ? new Date(at) : at;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTomorrow = startOfToday + 24 * 60 * 60 * 1000;
  const t = due.getTime();

  if (t < startOfToday) return "overdue";
  if (t < startOfTomorrow) return "today";
  return "upcoming";
}
