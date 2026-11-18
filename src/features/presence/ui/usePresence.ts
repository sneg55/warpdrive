"use client";

import { useCallback, useState } from "react";
import { useRealtimeChannel } from "@/features/realtime/useRealtimeChannel";
import type { WsFrame } from "@/features/realtime/wsMultiplexer";
import type { PresenceUser } from "@/types/presence";

export function usePresence(channel: string): PresenceUser[] {
  const [users, setUsers] = useState<PresenceUser[]>([]);

  const onFrame = useCallback(
    (frame: WsFrame) => {
      if (frame.kind === "reconnect") {
        setUsers([]);
        return;
      }
      if (frame.kind === "presence" && frame.channel === channel && Array.isArray(frame.users)) {
        setUsers(frame.users as PresenceUser[]);
      }
    },
    [channel],
  );

  useRealtimeChannel(channel, onFrame);
  return users;
}
