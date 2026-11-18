import type { Db } from "@/db/client";
import type { Goal } from "@/db/schema/goals";
import type { PermSetUser } from "@/features/permissions/effective";
import type { OwnerScope } from "@/types/stats";
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

export async function goalProgress(
  db: Db,
  actor: PermSetUser,
  goal: Goal,
  on: string,
  scope: OwnerScope,
  signal: AbortSignal,
): Promise<GoalProgress | null> {
  signal.throwIfAborted();
  const period = currentPeriod(goal.interval, goal.startsOn, goal.endsOn, on);
  if (period === null) return null;

  const actual = await goalActual(db, actor, goal, period, scope, signal);
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
