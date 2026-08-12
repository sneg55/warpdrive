import { z } from "zod";
import { LABEL_TARGETS } from "@/constants/labelColors";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { listAppliedLabelNames, listLabels } from "./labelsRepo";

export const labelsRouter = router({
  // Catalog labels for a target, feeding the client-side label pickers. Labels are global
  // metadata (not actor-scoped), like custom-field defs.
  listByTarget: protectedProcedure
    .input(z.object({ target: z.enum(LABEL_TARGETS) }))
    .query(({ ctx, input }) =>
      listLabels(ctx.db, { target: input.target }, AbortSignal.timeout(10_000)),
    ),

  // Label names records of this target actually carry. The catalog is the control point for what
  // can be applied, but a name written straight to the database (an import, a script, a psql
  // session) is still rendered on the record, so the filters union this in: a label you can see on
  // the list is a label you can filter by.
  appliedNames: protectedProcedure
    .input(z.object({ target: z.enum(LABEL_TARGETS) }))
    .query(({ ctx, input }) =>
      listAppliedLabelNames(ctx.db, input.target, AbortSignal.timeout(10_000)),
    ),
});
