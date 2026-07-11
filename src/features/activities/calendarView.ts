// URL-driven view model for the calendar: parse { view, d } at the boundary
// (invalid values fall back to defaults, never throw), pick the day window + DB
// range for the active view, and step the anchor for prev/next. All UTC.
import { addDaysUtc, addMonthsUtc, endOfDayUtc, monthGridDays, monthGridRange } from "./monthGrid";
import { weekDays } from "./weekGrid";

export type CalendarViewName = "week" | "month";

const MONTH_NAMES = [
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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00.000Z`);
  if (Number.isNaN(t)) return false;
  // Reject rolled-over values like 2026-13-40 (Date would normalize them).
  return new Date(t).toISOString().slice(0, 10) === s;
}

export function anchorDate(anchorIso: string): Date {
  return new Date(`${anchorIso}T00:00:00.000Z`);
}

export function parseCalendarParams(
  raw: { view?: string; d?: string },
  today: Date = new Date(),
): { view: CalendarViewName; anchorIso: string } {
  const view: CalendarViewName = raw.view === "month" ? "month" : "week";
  const anchorIso =
    raw.d !== undefined && isValidIsoDate(raw.d) ? raw.d : today.toISOString().slice(0, 10);
  return { view, anchorIso };
}

export function selectWindow(
  view: CalendarViewName,
  anchorIso: string,
): { days: Date[]; range: { from: Date; to: Date } } {
  const anchor = anchorDate(anchorIso);
  if (view === "month") {
    return { days: monthGridDays(anchor), range: monthGridRange(anchor) };
  }
  const days = weekDays(anchor);
  // E2: end-of-day Sunday so activities due later that day are not excluded by the inclusive BETWEEN.
  const last = addDaysUtc(days[0] ?? anchor, 6);
  return { days, range: { from: days[0] ?? anchor, to: endOfDayUtc(last) } };
}

export function stepAnchorIso(view: CalendarViewName, anchorIso: string, dir: 1 | -1): string {
  const anchor = anchorDate(anchorIso);
  const next = view === "month" ? addMonthsUtc(anchor, dir) : addDaysUtc(anchor, 7 * dir);
  return next.toISOString().slice(0, 10);
}

export function monthTitle(anchorIso: string): string {
  const d = anchorDate(anchorIso);
  return `${MONTH_NAMES[d.getUTCMonth()] ?? ""} ${d.getUTCFullYear()}`;
}

// Week header title: abbreviated month, day, and year (e.g. "Jun 15, 2026") so paging across
// a month or year boundary stays oriented (the old label dropped the month and year).
export function weekTitle(dayIso: string): string {
  const d = anchorDate(dayIso);
  const month = (MONTH_NAMES[d.getUTCMonth()] ?? "").slice(0, 3);
  return `${month} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

// Single source of truth for the calendar route + its query contract (view, d). Producer of
// every calendar link so a param rename stays in lock-step with parseCalendarParams.
export function calendarHref(view: CalendarViewName, dayIso: string): string {
  return `/activities/calendar?view=${view}&d=${dayIso}`;
}
