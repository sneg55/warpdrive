import { z } from "zod";
import { protectedProcedure } from "@/server/trpc/trpc";
import { buildMergeContext } from "./mergeContext";

const SIG = (): AbortSignal => AbortSignal.timeout(15_000);
export const mergeContextProcedure = protectedProcedure
  .input(
    z.object({
      recipientEmail: z.string().default(""),
      personId: z.string().uuid().nullish(),
      dealId: z.string().uuid().nullish(),
    }),
  )
  .query(({ ctx, input }) =>
    buildMergeContext(
      ctx.db,
      {
        owner: ctx.actor,
        recipientEmail: input.recipientEmail,
        explicitPersonId: input.personId ?? null,
        explicitDealId: input.dealId ?? null,
      },
      SIG(),
    ),
  );
