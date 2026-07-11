import { protectedProcedure, router } from "@/server/trpc/trpc";
import type { DealVisibilitySession } from "@/types/session";
import { getLeadById, listLeads } from "./leadRepo";
import { leadTimeline as loadLeadTimeline } from "./leadTimeline";
import { leadByIdInput, leadListInput, leadTimelineInput } from "./schemas";

// Build a DealVisibilitySession from the protected-procedure actor (mirrors dealRouter).
function actorToSession(actor: {
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

export const leadRouter = router({
  list: protectedProcedure
    .input(leadListInput)
    .query(({ ctx, input }) =>
      listLeads(ctx.db, actorToSession(ctx.actor), input, AbortSignal.timeout(10_000)),
    ),
  byId: protectedProcedure
    .input(leadByIdInput)
    .query(({ ctx, input }) =>
      getLeadById(ctx.db, actorToSession(ctx.actor), input.id, AbortSignal.timeout(10_000)),
    ),
  leadTimeline: protectedProcedure
    .input(leadTimelineInput)
    .query(({ ctx, input }) =>
      loadLeadTimeline(
        ctx.db,
        actorToSession(ctx.actor),
        input.leadId,
        AbortSignal.timeout(10_000),
      ),
    ),
});
