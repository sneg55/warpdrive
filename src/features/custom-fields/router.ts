import { z } from "zod";
import type { CustomFieldTarget } from "@/constants/customFieldTypes";
import { CUSTOM_FIELD_TARGETS } from "@/constants/customFieldTypes";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { listDefs } from "./defsRepo";
import { listHiddenBuiltins } from "./hiddenBuiltinsRepo";

export const customFieldsRouter = router({
  // listDefs takes no actor: custom-field definitions are global metadata.
  listDefs: protectedProcedure
    .input(z.object({ target: z.enum(CUSTOM_FIELD_TARGETS) }))
    .query(({ ctx, input }) => listDefs(ctx.db, input.target, {}, AbortSignal.timeout(10_000))),

  // Hidden built-in fields per entity, as arrays (Sets are not serialisable over the wire).
  // Global metadata, so ungated like listDefs; the write path (setBuiltinFieldHiddenAction) is gated.
  hiddenBuiltins: protectedProcedure.query(async ({ ctx }) => {
    const map = await listHiddenBuiltins(ctx.db, AbortSignal.timeout(10_000));
    return Object.fromEntries(
      Object.entries(map).map(([entity, set]) => [entity, [...set]]),
    ) as Record<CustomFieldTarget, string[]>;
  }),
});
