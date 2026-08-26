// Stats tRPC router: dashboard procedure.
// Security gate: resolves effective ownerScope server-side (never trusts client claim), and
// runs every stage-based query behind visiblePipelines so a restricted pipeline's stage names
// never reach a user who cannot see that pipeline. That applies to the "All pipelines"
// aggregate as much as to a single selected pipeline.
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { activitiesByType } from "@/features/stats/activitiesByType";
import { activitiesPerformance } from "@/features/stats/activitiesPerformance";
import { aggregateStageConversion, aggregateStageSums } from "@/features/stats/aggregateStages";
import { dealPerformance } from "@/features/stats/dealPerformance";
import { lostReasonBreakdown } from "@/features/stats/lostReasons";
import { ownerScope } from "@/features/stats/ownerScope";
import { stageConversion } from "@/features/stats/stageConversion";
import { stageSums } from "@/features/stats/stageSums";
import { isPipelineVisible, visiblePipelineIds } from "@/features/stats/visiblePipelines";
import { winRate } from "@/features/stats/winRate";
import { wonDealStats } from "@/features/stats/wonDealStats";
import { wonTrend } from "@/features/stats/wonTrend";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { dashboardInput } from "./schemas";

// Module-local abort-signal factory: mirrors the pattern in notifications/router.ts.
const SIG = (): AbortSignal => AbortSignal.timeout(15_000);

export const statsRouter = router({
  dashboard: protectedProcedure.input(dashboardInput).query(async ({ ctx, input }) => {
    // Trust boundary: the client cannot widen its own owner scope.
    const effectiveOwnerScope = ownerScope(ctx.actor, input.ownerScope);
    const signal = SIG();

    const requested = input.pipelineId;
    if (requested !== null && !(await isPipelineVisible(ctx.db, ctx.actor, requested, signal))) {
      throw new AppError(
        ERROR_IDS.STATS_PIPELINE_NOT_VISIBLE,
        "requested pipeline not visible to user (restricted or archived)",
        { pipelineId: requested },
      );
    }

    const filters = {
      pipelineId: requested,
      ownerScope: effectiveOwnerScope,
      from: input.from,
      to: input.to,
    };

    // Stage-based queries are inherently per pipeline: either the one selected, or every
    // visible one merged by stage position for the "All pipelines" view.
    const stagePipelineIds =
      requested !== null ? [requested] : await visiblePipelineIds(ctx.db, ctx.actor, signal);

    const [dp, ap, wds, abt, lrb, trend, perPipelineFunnel, perPipelineSums] = await Promise.all([
      dealPerformance(ctx.db, ctx.actor, filters, signal),
      activitiesPerformance(ctx.db, ctx.actor, filters, signal),
      wonDealStats(ctx.db, ctx.actor, filters, signal),
      activitiesByType(ctx.db, ctx.actor, filters, signal),
      lostReasonBreakdown(ctx.db, ctx.actor, filters, signal),
      wonTrend(ctx.db, ctx.actor, filters, signal),
      Promise.all(
        stagePipelineIds.map((pipelineId) =>
          stageConversion(ctx.db, ctx.actor, { ...filters, pipelineId }, signal),
        ),
      ),
      Promise.all(
        stagePipelineIds.map((pipelineId) =>
          stageSums(ctx.db, ctx.actor, pipelineId, effectiveOwnerScope, signal),
        ),
      ),
    ]);

    return {
      dealPerformance: dp,
      winRate: winRate(dp.won, dp.lost),
      wonDealStats: wds,
      wonTrend: trend,
      funnel: aggregateStageConversion(perPipelineFunnel),
      activities: ap,
      activitiesByType: abt,
      lostReasons: lrb,
      stageSums: aggregateStageSums(perPipelineSums),
      effectiveOwnerScope,
    };
  }),
});
