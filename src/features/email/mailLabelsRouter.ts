import { protectedProcedure, router } from "@/server/trpc/trpc";
import { listMailLabels } from "./mailLabelsRepo";

export const mailLabelsRouter = router({
  list: protectedProcedure.query(({ ctx }) => listMailLabels(ctx.db, AbortSignal.timeout(10_000))),
});
