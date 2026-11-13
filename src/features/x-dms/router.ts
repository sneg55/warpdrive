import { z } from "zod";
import { X_READ_TIMEOUT_MS } from "@/constants/xDms";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { unwrap } from "@/server/unwrap";
import { err } from "@/types/result";
import { xAccountNotFound } from "./access";
import {
  archiveXConversation,
  markXConversationRead,
  markXConversationUnread,
  unarchiveXConversation,
  xUnreadCount,
} from "./readState";
import { getXConversation, listXAccountsForActor, listXConversations } from "./reads";
import { isXDmsEnabled } from "./settings";

const SIG = (): AbortSignal => AbortSignal.timeout(X_READ_TIMEOUT_MS);

const conversationInput = z.object({ conversationId: z.uuid() });

const listInput = z.object({
  accountId: z.uuid(),
  view: z.enum(["inbox", "archived"]).default("inbox"),
  cursor: z.string().max(512).optional(),
});

const disabled = (conversationId: string) =>
  Promise.resolve(err(xAccountNotFound({ conversationId })));

type ConversationOp = typeof markXConversationRead;

export function makeXDmsRouter(enabled: () => boolean = isXDmsEnabled) {
  const mutate = (op: ConversationOp) =>
    protectedProcedure
      .input(conversationInput)
      .mutation(({ ctx, input }) =>
        unwrap(
          enabled()
            ? op(ctx.db, { actorId: ctx.actor.id, conversationId: input.conversationId }, SIG())
            : disabled(input.conversationId),
        ),
      );
  return router({
    enabled: protectedProcedure.query(() => enabled()),
    accounts: protectedProcedure.query(({ ctx }) =>
      enabled() ? listXAccountsForActor(ctx.db, ctx.actor.id, SIG()) : [],
    ),
    list: protectedProcedure
      .input(listInput)
      .query(({ ctx, input }) =>
        enabled()
          ? unwrap(listXConversations(ctx.db, { actorId: ctx.actor.id, ...input }, SIG()))
          : { rows: [], nextCursor: null },
      ),
    conversation: protectedProcedure
      .input(conversationInput)
      .query(({ ctx, input }) =>
        unwrap(
          enabled()
            ? getXConversation(
                ctx.db,
                { actorId: ctx.actor.id, conversationId: input.conversationId },
                SIG(),
              )
            : disabled(input.conversationId),
        ),
      ),
    unreadCount: protectedProcedure
      .input(z.object({ accountId: z.uuid().optional() }))
      .query(({ ctx, input }) =>
        enabled()
          ? xUnreadCount(ctx.db, { actorId: ctx.actor.id, accountId: input.accountId }, SIG())
          : 0,
      ),
    markRead: mutate(markXConversationRead),
    markUnread: mutate(markXConversationUnread),
    archive: mutate(archiveXConversation),
    unarchive: mutate(unarchiveXConversation),
  });
}

export const xDmsRouter = makeXDmsRouter();
