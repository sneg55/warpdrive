// The calendar day, in a given IANA zone, that a goal period should be resolved against.
//
// Taking this from the browser puts a viewer near UTC midnight on the wrong side of a period
// boundary, so a goal rolls a day early or late depending on where someone happens to be
// sitting. Resolving it server-side from the user's own timezone preference keeps one answer.
export function todayInZone(timeZone: string | null, now: Date): string {
  const zone = timeZone ?? "UTC";
  try {
    // en-CA gives YYYY-MM-DD, which is the format the goal queries take.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    // A stale or mistyped zone must not take the page down.
    return now.toISOString().slice(0, 10);
  }
}
