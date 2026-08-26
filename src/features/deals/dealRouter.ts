import { z } from "zod";
import { listParticipants } from "@/features/deal-workspace/participantsList";
import { parseSavedFilterDefinition } from "@/features/saved-filters/parseDefinition";
import { listSavedFilterViews } from "@/features/saved-filters/savedFilterList";
import { filterDefinition } from "@/features/saved-filters/schemas";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import type { DealVisibilitySession } from "@/types/session";
import { getBoardColumns, getStageSums, listDeals } from "./dealRepo";

// Build a DealVisibilitySession from the protected-procedure actor (mirrors
// how pipelineRouter.ts builds its session from ctx.actor).
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

export const dealRouter = router({
  board: protectedProcedure
    .input(z.object({ pipelineId: z.string().uuid(), definition: filterDefinition.optional() }))
    .query(({ ctx, input }) =>
      getBoardColumns(
        ctx.db,
        actorToSession(ctx.actor),
        input.pipelineId,
        AbortSignal.timeout(10_000),
        input.definition,
      ),
    ),
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
  // Paginated flat list for the DealList view (Task 23).
  // Returns rows, total deal count, and totalValue for the footer.
  list: protectedProcedure
    .input(
      z.object({
        pipelineId: z.string().uuid().optional(),
        offset: z.number().int().nonnegative().default(0),
        limit: z.number().int().min(1).max(500).default(50),
        archived: z.boolean().optional(),
        definition: filterDefinition.optional(),
      }),
    )
    .query(({ ctx, input }) =>
      listDeals(
        ctx.db,
        actorToSession(ctx.actor),
        {
          pipelineId: input.pipelineId,
          offset: input.offset,
          limit: input.limit,
          archived: input.archived,
          filter: input.definition,
        },
        AbortSignal.timeout(10_000),
      ),
    ),
  // Deal participants for the Summary "+ Participants" control. Visibility is enforced in
  // listParticipants (deal gate + per-person gate); an invisible deal returns [].
  participants: protectedProcedure
    .input(z.object({ dealId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      listParticipants(ctx.db, ctx.actor, input.dealId, AbortSignal.timeout(10_000)),
    ),
  // AST saved filters visible to the actor: own filters plus every shared one. A thin wrapper over
  // the shared saved-view read, kept as its own route because the board's query key is load-bearing
  // and deal-parsed so the client still receives a FilterDefinition.
  savedFilters: protectedProcedure.query(({ ctx }) =>
    listSavedFilterViews(ctx, "deal", parseSavedFilterDefinition),
  ),
});
