"use client";

import { useCallback } from "react";
import { wsChannel } from "@/constants/wsChannels";
import { useRealtimeChannel } from "@/features/realtime/useRealtimeChannel";
import type { WsFrame } from "@/features/realtime/wsMultiplexer";
import { trpc } from "@/lib/trpc-client";

interface UseInboxRealtimeArgs {
  selfActorId: string;
  openThreadId?: string;
  onTrackingEvent?: (kind: "open" | "click") => void;
}

export function useInboxRealtime({
  selfActorId,
  openThreadId,
  onTrackingEvent,
}: UseInboxRealtimeArgs): void {
  const utils = trpc.useUtils();

  const onFrame = useCallback(
    (frame: WsFrame) => {
      if (frame.kind === "reconnect") {
        void utils.email.invalidate();
        void utils.xDms.invalidate();
        if (openThreadId !== undefined) {
          void utils.email.thread.get.invalidate({ threadId: openThreadId });
        }
        return;
      }
      if (frame.kind === "resync") {
        void utils.email.invalidate();
        void utils.xDms.invalidate();
        return;
      }
      if (frame.kind !== "event" || frame.event === undefined) return;
      const event = frame.event;
      if (event.type === "email_arrived" || event.type === "email_thread_updated") {
        void utils.email.invalidate();
        const data = event.data as { threadId?: string };
        if (openThreadId !== undefined && data.threadId === openThreadId) {
          void utils.email.thread.get.invalidate({ threadId: openThreadId });
        }
      }
      if (event.type === "x_conversation_updated") {
        void utils.xDms.list.invalidate();
        void utils.xDms.conversation.invalidate();
        void utils.xDms.unreadCount.invalidate();
        void utils.xDms.accounts.invalidate();
      }
      if (event.type === "email_tracking") {
        if (openThreadId !== undefined) {
          void utils.email.thread.get.invalidate({ threadId: openThreadId });
          const data = event.data as { kind: "open" | "click" };
          onTrackingEvent?.(data.kind);
        }
      }
    },
    [utils, openThreadId, onTrackingEvent],
  );

  useRealtimeChannel(wsChannel.user(selfActorId), onFrame);
}
