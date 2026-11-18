import { z } from "zod";
import { LABEL_TARGETS } from "@/constants/labelColors";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { listAppliedLabelNames, listLabels } from "./labelsRepo";

export const labelsRouter = router({
  listByTarget: protectedProcedure
    .input(z.object({ target: z.enum(LABEL_TARGETS) }))
    .query(({ ctx, input }) =>
      listLabels(ctx.db, { target: input.target }, AbortSignal.timeout(10_000)),
    ),

  appliedNames: protectedProcedure
    .input(z.object({ target: z.enum(LABEL_TARGETS) }))
    .query(({ ctx, input }) =>
      listAppliedLabelNames(ctx.db, input.target, AbortSignal.timeout(10_000)),
    ),
});
