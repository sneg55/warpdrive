"use client";

// Thin wiring layer: subscribes to the user channel over the shared tab socket and invalidates the
// email caches on email_arrived and email_tracking events. This hook is untested-ok (the wiring is
// trivial; the logic lives server-side).
import { useCallback } from "react";
import { wsChannel } from "@/constants/wsChannels";
import { useRealtimeChannel } from "@/features/realtime/useRealtimeChannel";
import type { WsFrame } from "@/features/realtime/wsMultiplexer";
import { trpc } from "@/lib/trpc-client";

interface UseInboxRealtimeArgs {
  selfActorId: string;
  // openThreadId: the threadId currently displayed, if any. Used to also invalidate the thread.get
  // query when an email_arrived event targets that thread.
  openThreadId?: string;
  // onTrackingEvent: called when an email_tracking event arrives for the open thread.
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
        // Socket dropped: cover events missed while offline (the old onclose path).
        void utils.email.inbox.list.invalidate();
        if (openThreadId !== undefined) {
          void utils.email.thread.get.invalidate({ threadId: openThreadId });
        }
        return;
      }
      if (frame.kind === "resync") {
        void utils.email.inbox.list.invalidate();
        return;
      }
      if (frame.kind !== "event" || frame.event === undefined) return;
      const event = frame.event;
      if (event.type === "email_arrived") {
        void utils.email.inbox.list.invalidate();
        const data = event.data as { threadId?: string };
        if (openThreadId !== undefined && data.threadId === openThreadId) {
          void utils.email.thread.get.invalidate({ threadId: openThreadId });
        }
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
