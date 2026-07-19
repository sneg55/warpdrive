"use client";

// Thin wiring layer: subscribes to a presence channel over the shared tab socket and tracks which
// users are present via `presence` frames. Subscribing is itself what registers the user as present
// (the server joins presence on authorized subscribe). This hook is untested-ok: the wiring is
// trivial; the server-side presence logic (presenceHub.ts) is where the behavior lives.
import { useCallback, useState } from "react";
import { useRealtimeChannel } from "@/features/realtime/useRealtimeChannel";
import type { WsFrame } from "@/features/realtime/wsMultiplexer";
import type { PresenceUser } from "@/types/presence";

export function usePresence(channel: string): PresenceUser[] {
  const [users, setUsers] = useState<PresenceUser[]>([]);

  const onFrame = useCallback(
    (frame: WsFrame) => {
      if (frame.kind === "reconnect") {
        // Clear presence on disconnect so stale avatars do not linger (the old onclose behavior).
        setUsers([]);
        return;
      }
      // The multiplexer already routes by channel; the extra guard keeps this defensive.
      if (frame.kind === "presence" && frame.channel === channel && Array.isArray(frame.users)) {
        // Each presence frame is the full current snapshot; replace state wholesale.
        setUsers(frame.users as PresenceUser[]);
      }
    },
    [channel],
  );

  useRealtimeChannel(channel, onFrame);
  return users;
}
