import { BREVO_HISTORY_START, BREVO_OVERLAP_DAYS, BREVO_WINDOW_DAYS } from "@/constants/brevo";

const MS_PER_DAY = 86_400_000;

export interface DateWindow {
  startDate: string;
  endDate: string;
}

function toMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function addDays(date: string, days: number): string {
  return new Date(toMs(date) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toMs(to) - toMs(from)) / MS_PER_DAY);
}

export function utcDate(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function earlier(a: string, b: string): string {
  return a < b ? a : b;
}

export function startDateFor(coveredThrough: string | null, today: string): string {
  if (coveredThrough === null) return BREVO_HISTORY_START;
  return earlier(addDays(coveredThrough, 1), addDays(today, -BREVO_OVERLAP_DAYS));
}

export function planWindows(startDate: string, today: string): DateWindow[] {
  const windows: DateWindow[] = [];
  let cursor = startDate;
  while (cursor <= today) {
    const endDate = earlier(addDays(cursor, BREVO_WINDOW_DAYS - 1), today);
    windows.push({ startDate: cursor, endDate });
    cursor = addDays(endDate, 1);
  }
  return windows;
}

export function coveredThroughAfter(windowEnd: string, today: string): string {
  return earlier(windowEnd, addDays(today, -1));
}
