const MS_PER_DAY = 86_400_000;

export type ActivityState = "upcoming" | "today" | "overdue" | "none";

export function activityState(nextActivityAt: Date | null, now: Date): ActivityState {
  if (nextActivityAt === null) return "none";
  const sameDay =
    nextActivityAt.getUTCFullYear() === now.getUTCFullYear() &&
    nextActivityAt.getUTCMonth() === now.getUTCMonth() &&
    nextActivityAt.getUTCDate() === now.getUTCDate();
  if (sameDay) return "today";
  return nextActivityAt.getTime() < now.getTime() ? "overdue" : "upcoming";
}

function utcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function activityDayDelta(nextActivityAt: Date, now: Date): number {
  return Math.round((utcMidnight(nextActivityAt) - utcMidnight(now)) / MS_PER_DAY);
}

const NO_ACTIVITY_TOOLTIP = "No activity scheduled";
const UNKNOWN_SUBJECT = "Activity";

function dayUnit(n: number): string {
  return n === 1 ? "day" : "days";
}

export function activityTooltip(
  subject: string | null,
  nextActivityAt: Date | null,
  now: Date,
): string {
  if (nextActivityAt === null) return NO_ACTIVITY_TOOLTIP;
  const s = subject ?? UNKNOWN_SUBJECT;
  const delta = activityDayDelta(nextActivityAt, now);
  if (delta === 0) return `${s} · today`;
  if (delta > 0) return `${s} · in ${delta} ${dayUnit(delta)}`;
  const overdue = -delta;
  return `${s} · ${overdue} ${dayUnit(overdue)} overdue`;
}

export const MAX_ROT_LEVEL = 3;

function rotLevel(ageDays: number, rottingDays: number): number {
  if (ageDays <= rottingDays) return 0;
  const step = Math.floor((ageDays - rottingDays) / (rottingDays / 2));
  return Math.min(step + 1, MAX_ROT_LEVEL);
}

export function rottingState(
  stageEnteredAt: Date,
  rottingDays: number | null,
  now: Date,
): { rotting: boolean; ageDays: number; level: number } {
  const ageDays = Math.floor((now.getTime() - stageEnteredAt.getTime()) / MS_PER_DAY);
  if (rottingDays === null) return { rotting: false, ageDays, level: 0 };
  const level = rotLevel(ageDays, rottingDays);
  return { rotting: level > 0, ageDays, level };
}
