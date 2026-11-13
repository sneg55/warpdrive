"use client";

import { useInboxRealtime } from "@/features/email/useInboxRealtime";
import type { XListView } from "@/features/x-dms/reads";
import { XConversationList } from "@/features/x-dms/ui/XConversationList";

export function XListClient({
  selfActorId,
  accountId,
  accountName,
  view,
}: {
  selfActorId: string;
  accountId: string;
  accountName: string;
  view: XListView;
}): React.ReactNode {
  useInboxRealtime({ selfActorId });
  return <XConversationList accountId={accountId} accountName={accountName} view={view} />;
}
