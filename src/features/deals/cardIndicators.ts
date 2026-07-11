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
