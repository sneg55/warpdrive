"use client";

// Thin wiring layer: mints a WS ticket, subscribes to a channel, and tracks
// which users are currently present via `presence` frames from the server.
// Subscribing to the channel is itself what registers the user as present
// (the server joins presence on authorized subscribe).
// This hook is untested-ok: the wiring is trivial; the server-side presence
// logic (presenceHub.ts) is where the behavior lives.
import { useEffect, useState } from "react";
import { clientEnv } from "@/config/clientEnv";
import { trpc } from "@/lib/trpc-client";
import type { PresenceUser } from "@/types/presence";

// ServerFrame union extended with the presence frame kind (Task 14).
type ServerFrame =
  | { kind: "auth_ok" }
  | { kind: "subscribed"; channel: string }
  | { kind: "resync" }
  | { kind: "error"; channel: string }
  | { kind: "presence"; channel: string; users: PresenceUser[] };

export function usePresence(channel: string): PresenceUser[] {
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const ticketMutation = trpc.realtime.ticket.useMutation();
  const mutateAsync = ticketMutation.mutateAsync;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let dead = false;

    async function connect(): Promise<void> {
      // No WS endpoint configured (e.g. jsdom tests, or realtime disabled): skip
      // connecting rather than constructing a WebSocket with an invalid URL.
      if (clientEnv.WS_PUBLIC_URL === "") return;
      let ticket: string;
      try {
        const result = await mutateAsync();
        ticket = result.ticket;
      } catch {
        // On ticket failure, leave users empty; presence is best-effort.
        return;
      }
      if (dead) return;

      const ws = new WebSocket(clientEnv.WS_PUBLIC_URL);
      socket = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ kind: "auth", ticket }));
      };

      ws.onmessage = (evt: MessageEvent<string>) => {
        let frame: ServerFrame;
        try {
          frame = JSON.parse(evt.data) as ServerFrame;
        } catch {
          return;
        }

        if (frame.kind === "auth_ok") {
          ws.send(JSON.stringify({ kind: "subscribe", channel }));
          return;
        }

        if (frame.kind === "presence" && frame.channel === channel) {
          // Each presence frame is the full current snapshot; replace state wholesale.
          setUsers(frame.users);
          return;
        }
      };

      ws.onclose = () => {
        if (!dead) {
          // Clear presence on disconnect so stale avatars do not linger.
          setUsers([]);
        }
      };
    }

    void connect();

    return () => {
      dead = true;
      socket?.close();
    };
  }, [channel, mutateAsync]);

  return users;
}
