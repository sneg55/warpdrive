"use client";
import { useCallback, useState } from "react";
import { wsChannel } from "@/constants/wsChannels";
import { useRealtimeChannel } from "@/features/realtime/useRealtimeChannel";
import type { WsFrame } from "@/features/realtime/wsMultiplexer";
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

export function useImportProgress(batchId: string): ImportProgress {
  const utils = trpc.useUtils();
  const [progress, setProgress] = useState<ImportProgress>({
    processed: 0,
    total: 0,
    status: null,
  });

  const onFrame = useCallback(
    (frame: WsFrame) => {
      if (frame.kind === "reconnect" || frame.kind === "resync") {
        void utils.import.getBatch.invalidate({ batchId });
        return;
      }
      if (
        frame.kind === "event" &&
        frame.event !== undefined &&
        frame.event.type === "import_progress"
      ) {
        const data = frame.event.data as ProgressData;
        setProgress((prev) => reduceProgress(prev, data));
        void utils.import.getBatch.invalidate({ batchId });
      }
    },
    [utils, batchId],
  );

  useRealtimeChannel(wsChannel.importBatch(batchId), onFrame);
  return progress;
}
