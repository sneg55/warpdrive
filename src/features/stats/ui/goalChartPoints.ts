import { type GoalPeriod, periodDays } from "@/features/goals/goalPeriod";
import type { GoalSeriesPoint } from "@/features/goals/goalSeries";

export interface GoalChartPoint {
  day: string;
  actual: number | null;
  target: number;
}

export function goalChartPoints(
  period: GoalPeriod,
  series: GoalSeriesPoint[],
  target: string,
): GoalChartPoint[] {
  const days = periodDays(period);
  const booked = new Map(series.map((p) => [p.day, Number(p.actual)]));
  const total = Number(target);
  return days.map((day, i) => ({
    day,
    actual: booked.get(day) ?? null,
    target: (total * (i + 1)) / days.length,
  }));
}
