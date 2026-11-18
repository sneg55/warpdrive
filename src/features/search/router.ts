import { protectedProcedure, router } from "@/server/trpc/trpc";
import { searchAll } from "./query";
import { searchInput } from "./schemas";

const SIG = (): AbortSignal => AbortSignal.timeout(15_000);

export const searchRouter = router({
  query: protectedProcedure.input(searchInput).query(async ({ ctx, input }) => {
    const r = await searchAll(ctx.db, ctx.actor, input.q, SIG());
    if (r.ok === false) throw r.error;
    return r.value;
  }),
});
