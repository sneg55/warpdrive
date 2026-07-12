import { protectedProcedure, router } from "@/server/trpc/trpc";
import { listMailLabels } from "./mailLabelsRepo";

export const mailLabelsRouter = router({
  // The mail-label catalog, feeding the inbox label picker + thread chip resolver. Global metadata
  // (not actor-scoped), like the company label catalog.
  list: protectedProcedure.query(({ ctx }) => listMailLabels(ctx.db, AbortSignal.timeout(10_000))),
});
