"use client";

import { useInboxRealtime } from "@/features/email/useInboxRealtime";
import type { XConversationDetail, XListView } from "@/features/x-dms/reads";
import { X_DM_STRINGS } from "@/features/x-dms/strings";
import { XConversationPane } from "@/features/x-dms/ui/XConversationPane";

export function XConversationClient({
  selfActorId,
  accountId,
  conversationId,
  view,
  isAdmin,
  initialData,
}: {
  selfActorId: string;
  accountId: string;
  conversationId: string;
  view: XListView;
  isAdmin: boolean;
  initialData: XConversationDetail;
}): React.ReactNode {
  useInboxRealtime({ selfActorId });
  return (
    <main aria-label={X_DM_STRINGS.conversation} className="h-full">
      <XConversationPane
        conversationId={conversationId}
        accountId={accountId}
        view={view}
        isAdmin={isAdmin}
        initialData={initialData}
      />
    </main>
  );
}
