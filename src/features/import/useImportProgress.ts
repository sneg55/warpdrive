"use client";
import { useEffect, useState } from "react";
import { clientEnv } from "@/config/clientEnv";
import { wsChannel } from "@/constants/wsChannels";
import { trpc } from "@/lib/trpc-client";
import type { PublishedEvent } from "@/server/ws/payload";

export interface ImportProgress {
  processed: number;
  total: number;
  status: string | null;
}

type ProgressData = Extract<PublishedEvent, { type: "import_progress" }>["data"];

// Pure reducer so the wiring hook stays untested-ok (same rationale as useInboxRealtime).
export function reduceProgress(_prev: ImportProgress, data: ProgressData): ImportProgress {
  return { processed: data.processed, total: data.total, status: data.status };
}

type ServerFrame =
  | { kind: "auth_ok" }
  | { kind: "subscribed"; channel: string }
  | { kind: "event"; event: PublishedEvent & { seq: number } }
  | { kind: "resync" }
  | { kind: "error"; channel: string };

export function useImportProgress(batchId: string): ImportProgress {
  const utils = trpc.useUtils();
  const mutateAsync = trpc.realtime.ticket.useMutation().mutateAsync;
  const [progress, setProgress] = useState<ImportProgress>({
    processed: 0,
    total: 0,
    status: null,
  });

  useEffect(() => {
    let socket: WebSocket | null = null;
    let dead = false;

    async function connect(): Promise<void> {
      let ticket: string;
      try {
        ticket = (await mutateAsync()).ticket;
      } catch {
        void utils.import.getBatch.invalidate({ batchId });
        return;
      }
      if (dead) return;
      const ws = new WebSocket(clientEnv.WS_PUBLIC_URL);
      socket = ws;
      ws.onopen = () => ws.send(JSON.stringify({ kind: "auth", ticket }));
      ws.onmessage = (evt: MessageEvent<string>) => {
        let frame: ServerFrame;
        try {
          frame = JSON.parse(evt.data) as ServerFrame;
        } catch {
          return;
        }
        if (frame.kind === "auth_ok") {
          ws.send(JSON.stringify({ kind: "subscribe", channel: wsChannel.importBatch(batchId) }));
          return;
        }
        if (frame.kind === "event" && frame.event.type === "import_progress") {
          setProgress((prev) => reduceProgress(prev, frame.event.data as ProgressData));
          void utils.import.getBatch.invalidate({ batchId });
          return;
        }
        if (frame.kind === "resync") void utils.import.getBatch.invalidate({ batchId });
      };
      ws.onclose = () => {
        if (!dead) void utils.import.getBatch.invalidate({ batchId });
      };
    }

    void connect();
    return () => {
      dead = true;
      socket?.close();
    };
  }, [batchId, utils, mutateAsync]);

  return progress;
}
