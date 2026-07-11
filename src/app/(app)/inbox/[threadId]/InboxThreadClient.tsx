"use client";

import { useState } from "react";
import { ThreadPane } from "@/features/email/ThreadPane";
import { useInboxRealtime } from "@/features/email/useInboxRealtime";

interface InboxThreadClientProps {
  threadId: string;
  selfActorId: string;
}

export function InboxThreadClient({
  threadId,
  selfActorId,
}: InboxThreadClientProps): React.ReactNode {
  const [trackingBadge, setTrackingBadge] = useState<{ kind: "open" | "click" } | null>(null);

  useInboxRealtime({
    selfActorId,
    openThreadId: threadId,
    onTrackingEvent: (kind) => setTrackingBadge({ kind }),
  });

  return (
    <main aria-label="Thread" className="h-full">
      <ThreadPane threadId={threadId} trackingBadge={trackingBadge} />
    </main>
  );
}
