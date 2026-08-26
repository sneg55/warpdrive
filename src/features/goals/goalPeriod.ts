// Goal period arithmetic. Periods are anchored on the goal's start date, not the calendar:
// a quarterly goal starting 2026-02-01 runs Feb to Apr, not Jan to Mar.
// Dates are ISO YYYY-MM-DD throughout; all arithmetic is UTC so a viewer's timezone can
// never shift which period a date falls in.
import type { GoalInterval } from "@/constants/goals";

export interface GoalPeriod {
  start: string;
  end: string;
}

const MS_PER_DAY = 86_400_000;

function parse(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function format(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY);
}

// Adding months clamps to the last valid day: from the 31st, one month on is the 28th, 29th
// or 30th. Rolling into the next month instead would leave gaps between consecutive periods.
function addMonths(d: Date, months: number): Date {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + months;
  const day = d.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

function monthsPerPeriod(interval: GoalInterval): number {
  switch (interval) {
    case "monthly":
      return 1;
    case "quarterly":
      return 3;
    case "yearly":
      return 12;
    case "weekly":
      return 0;
  }
}

// Index of the period containing `on`, counting from the start date.
function periodIndex(interval: GoalInterval, start: Date, on: Date): number {
  if (interval === "weekly") {
    return Math.floor((on.getTime() - start.getTime()) / (7 * MS_PER_DAY));
  }
  const step = monthsPerPeriod(interval);
  // Walk forward rather than computing from month deltas: clamping makes period boundaries
  // non-uniform, so counting is the only way to stay consistent with periodStart below.
  let i = 0;
  while (addMonths(start, (i + 1) * step).getTime() <= on.getTime()) i += 1;
  return i;
}

function periodStart(interval: GoalInterval, start: Date, index: number): Date {
  return interval === "weekly"
    ? addDays(start, index * 7)
    : addMonths(start, index * monthsPerPeriod(interval));
}

// The period a goal is in on a given day, or null when that day is outside the goal's life.
// `endsOn` null means open-ended.
export function currentPeriod(
  interval: GoalInterval,
  startsOn: string,
  endsOn: string | null,
  on: string,
): GoalPeriod | null {
  const start = parse(startsOn);
  const day = parse(on);
  if (day.getTime() < start.getTime()) return null;

  const end = endsOn === null ? null : parse(endsOn);
  if (end !== null && day.getTime() > end.getTime()) return null;

  const index = periodIndex(interval, start, day);
  const from = periodStart(interval, start, index);
  const nextFrom = periodStart(interval, start, index + 1);
  let to = addDays(nextFrom, -1);
  // A goal that ends mid-period is clipped, so its target is not judged against days it was
  // never meant to cover.
  if (end !== null && to.getTime() > end.getTime()) to = end;

  return { start: format(from), end: format(to) };
}

// Share of the period that has been used up, counting the current day as spent. Day one of a
// 31-day month is 1/31, not 0, so pace is meaningful from the first day rather than dividing
// by zero.
export function elapsedFraction(period: GoalPeriod, on: string): number {
  const start = parse(period.start).getTime();
  const end = parse(period.end).getTime();
  const day = parse(on).getTime();
  if (day < start) return 0;
  const totalDays = (end - start) / MS_PER_DAY + 1;
  const doneDays = (day - start) / MS_PER_DAY + 1;
  return Math.min(1, doneDays / totalDays);
}
