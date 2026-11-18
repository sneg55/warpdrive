import { z } from "zod";
import type { Db } from "@/db/client";
import { attachRefLabels } from "@/features/custom-fields/refLabels";
import { listParticipants } from "@/features/deal-workspace/participantsList";
import { viewerTimeZone } from "@/features/identity/viewerTimeZone";
import { hasDateCondition } from "@/features/saved-filters/filterFields";
import { parseSavedFilterDefinition } from "@/features/saved-filters/parseDefinition";
import { listSavedFilterViews } from "@/features/saved-filters/savedFilterList";
import { type FilterDefinition, filterDefinition } from "@/features/saved-filters/schemas";
import { timeZoneInput } from "@/schemas/timeZoneInput";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import type { DealVisibilitySession } from "@/types/session";
import { getBoardColumns, getStageSums, listDeals } from "./dealRepo";

export function actorToSession(actor: {
  id: string;
  type: string;
  isActive: boolean;
  groupIds: ReadonlySet<string>;
  managedUserIds?: ReadonlySet<string>;
}): DealVisibilitySession {
  return {
    userId: actor.id,
    isAdmin: actor.type === "admin",
    isActive: actor.isActive,
    sessionLive: true,
    visibilityGroupIds: Array.from(actor.groupIds),
    managedUserIds: Array.from(actor.managedUserIds ?? []),
  };
}

function filterTimeZone(
  db: Db,
  userId: string,
  definition: FilterDefinition | undefined,
  requestZone: string | undefined,
  signal: AbortSignal,
): Promise<string | null> {
  if (!hasDateCondition(definition)) return Promise.resolve(null);
  return viewerTimeZone(db, userId, requestZone, signal);
}

export const dealRouter = router({
  board: protectedProcedure
    .input(
      z.object({
        pipelineId: z.string().uuid(),
        definition: filterDefinition.optional(),
        timeZone: timeZoneInput,
      }),
    )
    .query(async ({ ctx, input }) => {
      const signal = AbortSignal.timeout(10_000);
      return getBoardColumns(
        ctx.db,
        actorToSession(ctx.actor),
        input.pipelineId,
        signal,
        input.definition,
        await filterTimeZone(ctx.db, ctx.actor.id, input.definition, input.timeZone, signal),
      );
    }),
  stageSums: protectedProcedure
    .input(z.object({ pipelineId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      getStageSums(
        ctx.db,
        actorToSession(ctx.actor),
        input.pipelineId,
        AbortSignal.timeout(10_000),
      ),
    ),
  list: protectedProcedure
    .input(
      z.object({
        pipelineId: z.string().uuid().optional(),
        offset: z.number().int().nonnegative().default(0),
        limit: z.number().int().min(1).max(500).default(50),
        archived: z.boolean().optional(),
        definition: filterDefinition.optional(),
        timeZone: timeZoneInput,
      }),
    )
    .query(async ({ ctx, input }) => {
      const signal = AbortSignal.timeout(10_000);
      const result = await listDeals(
        ctx.db,
        actorToSession(ctx.actor),
        {
          pipelineId: input.pipelineId,
          offset: input.offset,
          limit: input.limit,
          archived: input.archived,
          filter: input.definition,
          timeZone: await filterTimeZone(
            ctx.db,
            ctx.actor.id,
            input.definition,
            input.timeZone,
            signal,
          ),
        },
        signal,
      );
      return attachRefLabels(ctx.db, ctx.actor, "deal", result, signal);
    }),
  participants: protectedProcedure
    .input(z.object({ dealId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      listParticipants(ctx.db, ctx.actor, input.dealId, AbortSignal.timeout(10_000)),
    ),
  savedFilters: protectedProcedure.query(({ ctx }) =>
    listSavedFilterViews(ctx, "deal", parseSavedFilterDefinition),
  ),
});
