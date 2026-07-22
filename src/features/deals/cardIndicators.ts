const MS_PER_DAY = 86_400_000;

export type ActivityState = "upcoming" | "today" | "overdue" | "none";

export function activityState(nextActivityAt: Date | null, now: Date): ActivityState {
  if (nextActivityAt === null) return "none";
  // Same calendar day is "due today" regardless of time-of-day: an activity due at 09:00 is still
  // due today at 15:00, not overdue. Only a strictly-earlier calendar day is overdue. This check
  // must come before the past-time comparison so earlier-today activities read as today, not overdue.
  const sameDay =
    nextActivityAt.getUTCFullYear() === now.getUTCFullYear() &&
    nextActivityAt.getUTCMonth() === now.getUTCMonth() &&
    nextActivityAt.getUTCDate() === now.getUTCDate();
  if (sameDay) return "today";
  return nextActivityAt.getTime() < now.getTime() ? "overdue" : "upcoming";
}

// Whole-calendar-day difference between the activity's due date and now, in the same UTC frame
// activityState uses. Positive = days in the future, 0 = due today, negative = days overdue. Pure
// so the tooltip copy is unit-testable without a clock.
function utcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function activityDayDelta(nextActivityAt: Date, now: Date): number {
  return Math.round((utcMidnight(nextActivityAt) - utcMidnight(now)) / MS_PER_DAY);
}

// Copy shown when a card has no scheduled activity, and the noun used when the soonest activity's
// subject is unknown (e.g. a stale cached next_activity_at with no matching open row).
const NO_ACTIVITY_TOOLTIP = "No activity scheduled";
const UNKNOWN_SUBJECT = "Activity";

function dayUnit(n: number): string {
  return n === 1 ? "day" : "days";
}

// Hover copy for the next-action badge: the soonest open activity's subject plus its timing, e.g.
// "Call Acme back · today" / "· in 4 days" / "· 3 days overdue". Terse, Pipedrive-style. The day
// buckets mirror activityState exactly (delta 0 = today, > 0 = upcoming, < 0 = overdue).
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

// Graded rot severity. 0 = healthy (age at or below the threshold, or no threshold). Once a deal
// sits longer than R days it reddens in steps of R/2: level 1 just past R, then +1 each R/2 days,
// capped so the card never exceeds the strongest tint. Pure so the tint is unit-testable.
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
  // A deal is "rotting" once it is strictly past the threshold, matching the graded tint (level > 0
  // starts at ageDays > rottingDays). Keeping the flag and the tint on the same boundary avoids a
  // card showing the "idle Nd" badge with no red tint on the threshold day.
  const level = rotLevel(ageDays, rottingDays);
  return { rotting: level > 0, ageDays, level };
}
