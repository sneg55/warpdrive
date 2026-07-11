import { protectedProcedure, router } from "@/server/trpc/trpc";
import { searchAll } from "./query";
import { searchInput } from "./schemas";

// 15-second timeout per request; no signal on ctx so we create one here.
// Matches the pattern used in src/features/notifications/router.ts.
const SIG = (): AbortSignal => AbortSignal.timeout(15_000);

export const searchRouter = router({
  query: protectedProcedure.input(searchInput).query(async ({ ctx, input }) => {
    const r = await searchAll(ctx.db, ctx.actor, input.q, SIG());
    if (r.ok === false) throw r.error;
    return r.value;
  }),
});
