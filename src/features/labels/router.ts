import { z } from "zod";
import { LABEL_TARGETS } from "@/constants/labelColors";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { listLabels } from "./labelsRepo";

export const labelsRouter = router({
  // Catalog labels for a target, feeding the client-side label pickers. Labels are global
  // metadata (not actor-scoped), like custom-field defs.
  listByTarget: protectedProcedure
    .input(z.object({ target: z.enum(LABEL_TARGETS) }))
    .query(({ ctx, input }) =>
      listLabels(ctx.db, { target: input.target }, AbortSignal.timeout(10_000)),
    ),
});
