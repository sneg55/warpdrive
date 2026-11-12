"use client";

import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";
import { useIntercomEnabled } from "./IntercomEnabledProvider";
import type { SupportConversationSummary, SupportScope } from "./supportTypes";

const NONE: SupportConversationSummary[] = [];

export function useSupportConversations(scope: SupportScope | null): SupportConversationSummary[] {
  const enabled = useIntercomEnabled();
  const query = trpc.intercom.list.useQuery(enabled && scope !== null ? { scope } : skipToken);
  return query.data ?? NONE;
}
