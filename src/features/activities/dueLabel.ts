// How a due timestamp reads in a list. Shared so the table, the compact list and the deal
// history all decide the same way whether a time is worth showing.
//
// An all-day activity stores local midnight as a placeholder for its day. Rendering that as
// "12:00 AM" shows the reader a time nobody chose, which is the whole reason the flag exists.
export function fmtDue(iso: string | null, allDay: boolean): string {
  if (iso === null) return "-";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    ...(allDay ? {} : { hour: "numeric", minute: "2-digit" }),
  });
}
