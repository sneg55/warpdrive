const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

// Format a "YYYY-MM-DD" ISO date as "Mon 29" (weekday + day-of-month), matching
// Pipedrive's calendar column headers. Parses the parts directly and computes
// the weekday in UTC so the result never drifts with the runtime timezone.
export function isoToDayHeading(iso: string): string {
  const [y, m, d] = iso.split("-").map((n) => Number.parseInt(n, 10));
  const weekday = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  return `${WEEKDAYS[weekday] ?? "?"} ${d ?? ""}`.trim();
}
