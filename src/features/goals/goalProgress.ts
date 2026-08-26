// One goal's standing on a given day: what it has booked in the current period, against its
// target, plus whether that is ahead of or behind the clock.
import type { Db } from "@/db/client";
import type { Goal } from "@/db/schema/goals";
import type { PermSetUser } from "@/features/permissions/effective";
import { goalActual } from "./goalActual";
import { attainment, pace } from "./goalMath";
import { currentPeriod, elapsedFraction } from "./goalPeriod";

export interface GoalProgress {
  goalId: string;
  periodStart: string;
  periodEnd: string;
  actual: string;
  target: string;
  attainment: number | null;
  pace: number | null;
}

// Null when `on` falls outside the goal's life: a goal that has not started or has ended has
// no current period, which is different from one sitting at zero.
export async function goalProgress(
  db: Db,
  actor: PermSetUser,
  goal: Goal,
  on: string,
  signal: AbortSignal,
): Promise<GoalProgress | null> {
  signal.throwIfAborted();
  const period = currentPeriod(goal.interval, goal.startsOn, goal.endsOn, on);
  if (period === null) return null;

  const actual = await goalActual(db, actor, goal, period, signal);
  const attained = attainment(actual, goal.target);
  return {
    goalId: goal.id,
    periodStart: period.start,
    periodEnd: period.end,
    actual,
    target: goal.target,
    attainment: attained,
    pace: pace(attained, elapsedFraction(period, on)),
  };
}
