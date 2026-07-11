"use client";

// Thin wiring layer: mints a WS ticket, subscribes to the user channel, and
// invalidates TanStack Query caches on notification events.
// Modeled closely on useInboxRealtime.ts. This hook is untested-ok (same rationale
// as useBoardRealtime: the wiring layer is trivial; logic lives in the server).
import { useEffect } from "react";
import { clientEnv } from "@/config/clientEnv";
import { wsChannel } from "@/constants/wsChannels";
import { trpc } from "@/lib/trpc-client";
import type { PublishedEvent } from "@/server/ws/payload";

type ServerFrame =
  | { kind: "auth_ok" }
  | { kind: "subscribed"; channel: string }
  | { kind: "event"; event: PublishedEvent & { seq: number } }
  | { kind: "resync" }
  | { kind: "error"; channel: string };

export function useNotificationStream(userId: string): void {
  const utils = trpc.useUtils();
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
        void utils.notifications.feed.invalidate();
        void utils.notifications.unreadCount.invalidate();
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
          ws.send(JSON.stringify({ kind: "subscribe", channel: wsChannel.user(userId) }));
          return;
        }

        if (frame.kind === "event") {
          const { event } = frame;

          if (event.type === "notification") {
            void utils.notifications.feed.invalidate();
            void utils.notifications.unreadCount.invalidate();
          }

          return;
        }

        if (frame.kind === "resync") {
          void utils.notifications.feed.invalidate();
          void utils.notifications.unreadCount.invalidate();
          return;
        }
      };

      ws.onclose = () => {
        if (!dead) {
          void utils.notifications.feed.invalidate();
          void utils.notifications.unreadCount.invalidate();
        }
      };
    }

    void connect();

    return () => {
      dead = true;
      socket?.close();
    };
  }, [userId, utils, mutateAsync]);
}
