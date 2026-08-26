import { z } from "zod";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { parseSavedFilterDefinitionFor } from "./parseDefinition";
import { listSavedFilterViews } from "./savedFilterList";
import { SAVED_FILTER_TARGET_ENTITIES } from "./schemas";

export const savedFiltersRouter = router({
  // Saved views visible to the actor for one entity: own views plus every shared one. The jsonb
  // definition is parsed server-side, where zod already lives, so a list client receives a trusted
  // definition without shipping zod to parse its own views.
  listByTarget: protectedProcedure
    .input(z.object({ targetEntity: z.enum(SAVED_FILTER_TARGET_ENTITIES) }))
    .query(({ ctx, input }) =>
      listSavedFilterViews(ctx, input.targetEntity, (raw) =>
        parseSavedFilterDefinitionFor(input.targetEntity, raw),
      ),
    ),
});
