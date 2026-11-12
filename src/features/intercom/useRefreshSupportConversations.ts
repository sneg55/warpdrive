"use client";

import { trpc } from "@/lib/trpc-client";

export function useRefreshSupportConversations(): () => void {
  const utils = trpc.useUtils();
  return () => {
    void utils.intercom.list.invalidate();
  };
}
