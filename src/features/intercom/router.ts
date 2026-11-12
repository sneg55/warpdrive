import { z } from "zod";
import { INTERCOM_READ_TIMEOUT_MS } from "@/constants/intercom";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { unwrap } from "@/server/unwrap";
import { getSupportConversationParts } from "./parts";
import { listSupportConversations } from "./reads";
import { isIntercomEnabled } from "./settings";
import type { SupportConversationPart, SupportConversationSummary } from "./supportTypes";

const SIG = (): AbortSignal => AbortSignal.timeout(INTERCOM_READ_TIMEOUT_MS);
const NONE: SupportConversationSummary[] = [];
const NO_PARTS: SupportConversationPart[] = [];

export const supportScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("person"), personId: z.string().uuid() }),
  z.object({ kind: z.literal("deal"), dealId: z.string().uuid() }),
  z.object({ kind: z.literal("lead"), leadId: z.string().uuid() }),
]);

export function makeIntercomRouter(enabled: () => boolean = isIntercomEnabled) {
  return router({
    list: protectedProcedure
      .input(z.object({ scope: supportScopeSchema }))
      .query(({ ctx, input }) =>
        enabled() ? listSupportConversations(ctx.db, ctx.actor, input.scope, SIG()) : NONE,
      ),
    parts: protectedProcedure
      .input(
        z.object({
          conversationId: z.string().min(1).max(64),
          scope: supportScopeSchema,
          allowRemote: z.boolean().default(false),
        }),
      )
      .query(({ ctx, input }) =>
        enabled() ? unwrap(getSupportConversationParts(ctx.db, ctx.actor, input, SIG())) : NO_PARTS,
      ),
  });
}

export const intercomRouter = makeIntercomRouter();
