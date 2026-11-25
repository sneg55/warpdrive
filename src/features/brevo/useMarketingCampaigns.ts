"use client";

import { skipToken } from "@tanstack/react-query";
import type { SupportScope } from "@/features/intercom/supportTypes";
import { trpc } from "@/lib/trpc-client";
import { useBrevoEnabled } from "./BrevoEnabledProvider";
import type { MarketingCampaignList } from "./types";

const NONE: MarketingCampaignList = { items: [], truncated: false };

export function useMarketingCampaigns(scope: SupportScope | null): MarketingCampaignList {
  const enabled = useBrevoEnabled();
  const query = trpc.brevo.list.useQuery(enabled && scope !== null ? { scope } : skipToken);
  return query.data ?? NONE;
}
