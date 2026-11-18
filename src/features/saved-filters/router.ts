import { z } from "zod";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { parseSavedFilterDefinitionFor } from "./parseDefinition";
import { listSavedFilterViews } from "./savedFilterList";
import { SAVED_FILTER_TARGET_ENTITIES } from "./schemas";

export const savedFiltersRouter = router({
  listByTarget: protectedProcedure
    .input(z.object({ targetEntity: z.enum(SAVED_FILTER_TARGET_ENTITIES) }))
    .query(({ ctx, input }) =>
      listSavedFilterViews(ctx, input.targetEntity, (raw) =>
        parseSavedFilterDefinitionFor(input.targetEntity, raw),
      ),
    ),
});
