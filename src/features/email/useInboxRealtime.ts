"use client";

// Thin wiring layer: mints a WS ticket, subscribes to the user channel, and
// invalidates TanStack Query caches on email_arrived and email_tracking events.
// Modeled closely on useBoardRealtime.ts. This hook is untested-ok (same rationale
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

interface UseInboxRealtimeArgs {
  selfActorId: string;
  // openThreadId: the threadId currently displayed, if any. Used to also invalidate
  // the thread.get query when an email_arrived event targets that thread.
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
  const ticketMutation = trpc.realtime.ticket.useMutation();
  const mutateAsync = ticketMutation.mutateAsync;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let dead = false;

    async function connect(): Promise<void> {
      let ticket: string;
      try {
        const result = await mutateAsync();
        ticket = result.ticket;
      } catch {
        // On ticket failure, invalidate so the UI re-fetches fresh data.
        void utils.email.inbox.list.invalidate();
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
          ws.send(JSON.stringify({ kind: "subscribe", channel: wsChannel.user(selfActorId) }));
          return;
        }

        if (frame.kind === "event") {
          const { event } = frame;

          if (event.type === "email_arrived") {
            void utils.email.inbox.list.invalidate();
            if (openThreadId !== undefined && event.data.threadId === openThreadId) {
              void utils.email.thread.get.invalidate({ threadId: openThreadId });
            }
          }

          if (event.type === "email_tracking") {
            if (openThreadId !== undefined) {
              void utils.email.thread.get.invalidate({ threadId: openThreadId });
              onTrackingEvent?.(event.data.kind);
            }
          }

          return;
        }

        if (frame.kind === "resync") {
          void utils.email.inbox.list.invalidate();
          return;
        }
      };

      // On disconnect, invalidate to cover events missed while offline.
      ws.onclose = () => {
        if (!dead) {
          void utils.email.inbox.list.invalidate();
          if (openThreadId !== undefined) {
            void utils.email.thread.get.invalidate({ threadId: openThreadId });
          }
        }
      };
    }

    void connect();

    return () => {
      dead = true;
      socket?.close();
    };
  }, [selfActorId, openThreadId, onTrackingEvent, utils, mutateAsync]);
}
