// Stats tRPC router: dashboard procedure.
// Security gate: resolves effective ownerScope server-side (never trusts client claim),
// and checks pipeline visibility before calling funnel/stageSums to prevent stage-name leaks.
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { pipelines } from "@/db/schema";
import { activitiesPerformance } from "@/features/stats/activitiesPerformance";
import { dealPerformance } from "@/features/stats/dealPerformance";
import { funnel } from "@/features/stats/funnel";
import { ownerScope } from "@/features/stats/ownerScope";
import { stageSums } from "@/features/stats/stageSums";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { dashboardInput } from "./schemas";

// Module-local abort-signal factory: mirrors the pattern in notifications/router.ts.
const SIG = (): AbortSignal => AbortSignal.timeout(15_000);

export const statsRouter = router({
  dashboard: protectedProcedure.input(dashboardInput).query(async ({ ctx, input }) => {
    // 1. Resolve effective owner scope server-side (trust-boundary: client cannot widen).
    const effectiveOwnerScope = ownerScope(ctx.actor, input.ownerScope);

    const signal = SIG();

    // 2. "All pipelines" (pipelineId omitted/null): aggregate deal + activity
    //    performance across EVERY pipeline the actor can see. Both queries self-filter
    //    by deal visibility, so no pipeline-visibility gate is needed. Funnel and stage
    //    sums are inherently per-pipeline (stage-based), so they are empty in this view.
    if (input.pipelineId === null) {
      const allFilters = {
        pipelineId: null,
        ownerScope: effectiveOwnerScope,
        from: input.from,
        to: input.to,
      };
      const [dp, ap] = await Promise.all([
        dealPerformance(ctx.db, ctx.actor, allFilters, signal),
        activitiesPerformance(ctx.db, ctx.actor, allFilters, signal),
      ]);
      return {
        dealPerformance: dp,
        funnel: [],
        activities: ap,
        stageSums: [],
        effectiveOwnerScope,
      };
    }

    const pipelineId = input.pipelineId;

    // 3. Pipeline-visibility gate (required before funnel/stageSums to prevent stage-name leaks).
    //    dealPerformance/activitiesPerformance self-filter by deal visibility and do not need this.
    // Reproduce the exact predicate from pipelineRouter.listVisiblePipelines:
    //   archived pipelines are never visible; admin sees all the rest; otherwise
    //   visibility_group_id IS NULL OR in actor.groupIds.
    const groupIds = Array.from(ctx.actor.groupIds);
    const visibilityPredicate =
      ctx.actor.type === "admin"
        ? sql`true`
        : or(
            isNull(pipelines.visibilityGroupId),
            groupIds.length > 0 ? inArray(pipelines.visibilityGroupId, groupIds) : sql`false`,
          );

    const [pipelineRow] = await ctx.db
      .select({ id: pipelines.id })
      .from(pipelines)
      .where(
        and(eq(pipelines.id, pipelineId), eq(pipelines.isArchived, false), visibilityPredicate),
      );

    if (pipelineRow === undefined) {
      throw new AppError(
        ERROR_IDS.STATS_PIPELINE_NOT_VISIBLE,
        "requested pipeline not visible to user (restricted or archived)",
        { pipelineId },
      );
    }

    // 4. Build shared filters for the queries that accept them.
    const filters = {
      pipelineId,
      ownerScope: effectiveOwnerScope,
      from: input.from,
      to: input.to,
    };

    // 5. Fan out all four queries in parallel under the shared timeout so a single
    //    abort cancels the whole fan-out.
    const [dp, fn, ap, ss] = await Promise.all([
      dealPerformance(ctx.db, ctx.actor, filters, signal),
      funnel(ctx.db, ctx.actor, pipelineId, effectiveOwnerScope, signal),
      activitiesPerformance(ctx.db, ctx.actor, filters, signal),
      stageSums(ctx.db, ctx.actor, pipelineId, effectiveOwnerScope, signal),
    ]);

    return {
      dealPerformance: dp,
      funnel: fn,
      activities: ap,
      stageSums: ss,
      effectiveOwnerScope,
    };
  }),
});
