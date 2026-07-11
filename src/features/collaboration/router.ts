import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ENTITY_TYPES } from "@/constants/entityTypes";
import type { Db } from "@/db/client";
import type { PermSetUser } from "@/features/permissions/effective";
import { assertReferenceVisible } from "@/features/permissions/referenceCheck";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import type { EntityType } from "@/types/entityRef";
import { listChangeLog } from "./changeLog";
import { listNotes } from "./notesRepo";

// Build the DealVisibilitySession shape assertReferenceVisible expects.
function toRefActor(actor: PermSetUser) {
  return {
    userId: actor.id,
    isActive: actor.isActive,
    sessionLive: true,
    isAdmin: actor.type === "admin",
    visibilityGroupIds: Array.from(actor.groupIds),
    managedUserIds: Array.from(actor.managedUserIds ?? []),
  };
}

const entityInput = z.object({
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.string().uuid(),
});

// listNotes/listChangeLog do NOT gate the parent (notes/changelog inherit parent
// visibility); the router must verify the parent is visible first. ENTITY_TYPES
// (deal/person/organization/lead) are all valid EntityRef kinds, so a single
// assertReferenceVisible call covers all cases. Throws NOT_FOUND if invisible.
async function gateParent(
  db: Db,
  actor: PermSetUser,
  entityType: EntityType,
  entityId: string,
  signal: AbortSignal,
): Promise<void> {
  const check = await assertReferenceVisible(
    db,
    toRefActor(actor),
    { kind: entityType, id: entityId },
    signal,
  );
  if (!check.ok) {
    throw new TRPCError({ code: "NOT_FOUND", message: check.error.id });
  }
}

export const collaborationRouter = router({
  listNotes: protectedProcedure.input(entityInput).query(async ({ ctx, input }) => {
    const signal = AbortSignal.timeout(10_000);
    await gateParent(ctx.db, ctx.actor, input.entityType, input.entityId, signal);
    return listNotes(ctx.db, input.entityType, input.entityId, signal);
  }),

  listChangeLog: protectedProcedure.input(entityInput).query(async ({ ctx, input }) => {
    const signal = AbortSignal.timeout(10_000);
    await gateParent(ctx.db, ctx.actor, input.entityType, input.entityId, signal);
    return listChangeLog(ctx.db, input.entityType, input.entityId, signal);
  }),

  // TODO Phase 3 follow-up: listFiles needs a filesRepo with a per-entity list function.
  // TODO Phase 3 follow-up: createComment needs a createComment function in a commentsRepo.
});
