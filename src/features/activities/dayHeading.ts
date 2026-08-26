const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

// Format a "YYYY-MM-DD" ISO date as "Mon 29" (weekday + day-of-month), matching
// Pipedrive's calendar column headers. Parses the parts directly and computes
// the weekday in UTC so the result never drifts with the runtime timezone.
export function isoToDayHeading(iso: string): string {
  const [y, m, d] = iso.split("-").map((n) => Number.parseInt(n, 10));
  const weekday = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  return `${WEEKDAYS[weekday] ?? "?"} ${d ?? ""}`.trim();
}

const WEEKDAYS_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

// Spoken form of a day column, e.g. "Monday 31 August 2026". The visible heading is abbreviated to
// fit the column; a screen reader announcing "Mon 31" seven times says very little about which day
// each group of activities belongs to.
export function isoToDayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map((n) => Number.parseInt(n, 10));
  const weekday = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  const month = MONTHS_LONG[(m ?? 1) - 1] ?? "";
  return `${WEEKDAYS_LONG[weekday] ?? "?"} ${d ?? ""} ${month} ${y ?? ""}`.trim();
}
