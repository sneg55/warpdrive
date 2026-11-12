import { z } from "zod";
import type { Goal } from "@/db/schema/goals";
import { type GoalProgress, goalProgress } from "@/features/goals/goalProgress";
import { type GoalSeriesPoint, goalSeries } from "@/features/goals/goalSeries";
import { goalAssigneeNames, listVisibleGoals } from "@/features/goals/goalsRepo";
import { ownerScope } from "@/features/stats/ownerScope";
import { ownerScopeInput } from "@/features/stats/schemas";
import { protectedProcedure, router } from "@/server/trpc/trpc";

const SIG = (): AbortSignal => AbortSignal.timeout(15_000);

export interface GoalWithProgress {
  goal: Goal;
  assigneeName: string | null;
  progress: GoalProgress | null;
  series: GoalSeriesPoint[];
}

export const goalsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        on: z.string().date(),
        ownerScope: ownerScopeInput.default({ kind: "me" }),
      }),
    )
    .query(async ({ ctx, input }): Promise<GoalWithProgress[]> => {
      const signal = SIG();
      const scope = ownerScope(ctx.actor, input.ownerScope);
      const rows = await listVisibleGoals(ctx.db, ctx.actor, scope, signal);
      const [names, standings] = await Promise.all([
        goalAssigneeNames(ctx.db, rows, signal),
        Promise.all(
          rows.map(async (goal) => {
            const progress = await goalProgress(ctx.db, ctx.actor, goal, input.on, scope, signal);
            if (progress === null) return { progress, series: [] };
            const period = { start: progress.periodStart, end: progress.periodEnd };
            return {
              progress,
              series: await goalSeries(ctx.db, ctx.actor, goal, period, input.on, scope, signal),
            };
          }),
        ),
      ]);
      return rows.map((goal, i) => ({
        goal,
        assigneeName: goal.assigneeId !== null ? (names.get(goal.assigneeId) ?? null) : null,
        progress: standings[i]?.progress ?? null,
        series: standings[i]?.series ?? [],
      }));
    }),
});
