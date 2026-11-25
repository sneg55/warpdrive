import { z } from "zod";
import { BREVO_READ_TIMEOUT_MS } from "@/constants/brevo";
import { supportScopeSchema } from "@/features/intercom/router";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { listMarketingCampaigns } from "./reads";
import { isBrevoEnabled } from "./settings";
import type { MarketingCampaignList } from "./types";

const SIG = (): AbortSignal => AbortSignal.timeout(BREVO_READ_TIMEOUT_MS);
const NONE: MarketingCampaignList = { items: [], truncated: false };

export function makeBrevoRouter(enabled: () => boolean = isBrevoEnabled) {
  return router({
    list: protectedProcedure
      .input(z.object({ scope: supportScopeSchema }))
      .query(({ ctx, input }) =>
        enabled() ? listMarketingCampaigns(ctx.db, ctx.actor, input.scope, SIG()) : NONE,
      ),
  });
}

export const brevoRouter = makeBrevoRouter();
