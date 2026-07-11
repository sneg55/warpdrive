import { TRPCError } from "@trpc/server";
import { mintTicket } from "@/server/ws/ticket";
import { err, ok, type Result } from "@/types/result";
import { protectedProcedure, router } from "../trpc";

// Pure-ish helper so the gate is unit-testable without a tRPC harness.
export async function mintTicketForActor(args: {
  userId: string;
  sessionId: string;
  isActive: boolean;
  sessionLive: boolean;
}): Promise<Result<{ ticket: string }, "refused">> {
  if (!args.isActive || !args.sessionLive) return err("refused");
  const ticket = await mintTicket({ userId: args.userId, sessionId: args.sessionId });
  return ok({ ticket });
}

export const realtimeRouter = router({
  ticket: protectedProcedure.mutation(async ({ ctx }) => {
    // ctx.actor non-null and session live by protectedProcedure; re-affirm is_active.
    const r = await mintTicketForActor({
      userId: ctx.session.userId,
      sessionId: ctx.session.sessionId,
      isActive: ctx.actor.isActive,
      sessionLive: true,
    });
    if (!r.ok) throw new TRPCError({ code: "UNAUTHORIZED", message: "E_AUTH_003" });
    return r.value;
  }),
});
