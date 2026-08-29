// Goals tRPC router: the list a user is allowed to see, each with its standing today.
// Progress is computed per goal rather than in one query: each goal names its own subject,
// action, assignee and pipeline, so they share no predicate worth batching.

import { z } from "zod";
import type { Goal } from "@/db/schema/goals";
import { type GoalProgress, goalProgress } from "@/features/goals/goalProgress";
import { type GoalSeriesPoint, goalSeries } from "@/features/goals/goalSeries";
import { listVisibleGoals } from "@/features/goals/goalsRepo";
import { protectedProcedure, router } from "@/server/trpc/trpc";

const SIG = (): AbortSignal => AbortSignal.timeout(15_000);

export interface GoalWithProgress {
  goal: Goal;
  progress: GoalProgress | null;
  series: GoalSeriesPoint[];
}

export const goalsRouter = router({
  // `on` is supplied by the caller rather than read from the server clock so the page can ask
  // about a specific day, and so tests are not at the mercy of when they run.
  list: protectedProcedure
    .input(z.object({ on: z.string().date() }))
    .query(async ({ ctx, input }): Promise<GoalWithProgress[]> => {
      const signal = SIG();
      const rows = await listVisibleGoals(ctx.db, ctx.actor, signal);
      return Promise.all(
        rows.map(async (goal) => {
          const progress = await goalProgress(ctx.db, ctx.actor, goal, input.on, signal);
          if (progress === null) return { goal, progress, series: [] };
          const period = { start: progress.periodStart, end: progress.periodEnd };
          return {
            goal,
            progress,
            series: await goalSeries(ctx.db, ctx.actor, goal, period, input.on, signal),
          };
        }),
      );
    }),
});
