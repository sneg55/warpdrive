import { z } from "zod";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { getFeed, getUnreadCount } from "./feed";
import { getPreferences } from "./preferences";

const SIG = (): AbortSignal => AbortSignal.timeout(15_000);

export const notificationsRouter = router({
  feed: protectedProcedure
    .input(z.object({ limit: z.number().int().positive().max(100).default(50) }))
    .query(({ ctx, input }) => getFeed(ctx.db, ctx.actor, input.limit, SIG())),

  unreadCount: protectedProcedure.query(({ ctx }) => getUnreadCount(ctx.db, ctx.actor, SIG())),

  preferences: protectedProcedure.query(({ ctx }) => getPreferences(ctx.db, ctx.actor.id, SIG())),
});
