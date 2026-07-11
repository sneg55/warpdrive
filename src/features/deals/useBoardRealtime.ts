"use client";

// Thin wiring layer: mints a WS ticket, opens a socket to the pipeline channel,
// and feeds inbound frames through reduceRealtime into the TanStack Query cache.
// The reducer holds all logic and is the tested artifact; this hook is untested-ok.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { clientEnv } from "@/config/clientEnv";
import { dealMovedChannel } from "@/constants/boardChannels";
import { trpc } from "@/lib/trpc-client";
import type { BoardEvent } from "@/server/realtime/events";
import type { BoardData } from "./boardCache";
import { reduceRealtime } from "./realtimeReducer";
import { BOARD_QUERY_KEY } from "./useDealMove";

// Frame shapes sent by the WS server (server.ts).
type ServerFrame =
  | { kind: "auth_ok" }
  | { kind: "subscribed"; channel: string }
  | { kind: "event"; event: BoardEvent & { seq: number } }
  | { kind: "resync" }
  | { kind: "error"; channel: string };

export function useBoardRealtime(pipelineId: string, selfActorId: string): void {
  const queryClient = useQueryClient();
  // Stable reference: only changes when pipelineId changes.
  const key = useMemo(() => BOARD_QUERY_KEY(pipelineId), [pipelineId]);
  // -1 so the first server event (seq=0) satisfies seq === lastSeq + 1 and is applied.
  const lastSeqRef = useRef(-1);
  const ticketMutation = trpc.realtime.ticket.useMutation();
  const mutateAsync = ticketMutation.mutateAsync;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let dead = false;

    async function connect(): Promise<void> {
      // Mint a short-lived ticket via tRPC; the WS server validates it on the
      // auth frame (ops spec A1). Abort if the effect was cleaned up already.
      let ticket: string;
      try {
        const result = await mutateAsync();
        ticket = result.ticket;
      } catch {
        // On ticket failure, invalidate so the UI re-fetches fresh data.
        void queryClient.invalidateQueries({ queryKey: key });
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
          const channel = dealMovedChannel(pipelineId);
          ws.send(JSON.stringify({ kind: "subscribe", channel }));
          return;
        }

        if (frame.kind === "event") {
          const current = queryClient.getQueryData<BoardData>(key) ?? { cards: [] };
          const out = reduceRealtime(
            { lastSeq: lastSeqRef.current, data: current },
            { kind: "event", event: frame.event, seq: frame.event.seq, selfActorId },
          );
          lastSeqRef.current = out.lastSeq;
          if (out.effect === "patch" && out.data !== undefined) {
            queryClient.setQueryData(key, out.data);
          } else if (out.effect === "invalidate") {
            void queryClient.invalidateQueries({ queryKey: key });
          }
          return;
        }

        if (frame.kind === "resync") {
          void queryClient.invalidateQueries({ queryKey: key });
          return;
        }
      };

      // On disconnect, invalidate to cover any events missed while offline (ops A4).
      ws.onclose = () => {
        if (!dead) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
      };
    }

    void connect();

    return () => {
      dead = true;
      socket?.close();
    };
  }, [pipelineId, selfActorId, queryClient, key, mutateAsync]);
}
