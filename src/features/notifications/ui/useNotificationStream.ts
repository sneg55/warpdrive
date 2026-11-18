"use client";

import { useCallback } from "react";
import { wsChannel } from "@/constants/wsChannels";
import { useRealtimeChannel } from "@/features/realtime/useRealtimeChannel";
import type { WsFrame } from "@/features/realtime/wsMultiplexer";
import { trpc } from "@/lib/trpc-client";

export function useNotificationStream(userId: string): void {
  const utils = trpc.useUtils();

  const onFrame = useCallback(
    (frame: WsFrame) => {
      const isNotification = frame.kind === "event" && frame.event?.type === "notification";
      if (frame.kind === "reconnect" || frame.kind === "resync" || isNotification) {
        void utils.notifications.feed.invalidate();
        void utils.notifications.unreadCount.invalidate();
      }
    },
    [utils],
  );

  useRealtimeChannel(wsChannel.user(userId), onFrame);
}
