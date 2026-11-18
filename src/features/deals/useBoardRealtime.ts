"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";
import { dealMovedChannel } from "@/constants/boardChannels";
import { useRealtimeChannel } from "@/features/realtime/useRealtimeChannel";
import type { WsFrame } from "@/features/realtime/wsMultiplexer";
import type { BoardEvent } from "@/server/realtime/events";
import type { BoardData } from "./boardCache";
import { reduceRealtime } from "./realtimeReducer";
import { BOARD_QUERY_KEY } from "./useDealMove";

export function useBoardRealtime(pipelineId: string, selfActorId: string): void {
  const queryClient = useQueryClient();
  const key = useMemo(() => BOARD_QUERY_KEY(pipelineId), [pipelineId]);
  const lastSeqRef = useRef(-1);

  const onFrame = useCallback(
    (frame: WsFrame) => {
      if (frame.kind === "reconnect") {
        lastSeqRef.current = -1;
        void queryClient.invalidateQueries({ queryKey: key });
        return;
      }
      if (frame.kind === "resync") {
        void queryClient.invalidateQueries({ queryKey: key });
        return;
      }
      if (frame.kind !== "event" || frame.event === undefined) return;
      const event = frame.event as BoardEvent & { seq: number };
      const current = queryClient.getQueryData<BoardData>(key) ?? { cards: [] };
      const out = reduceRealtime(
        { lastSeq: lastSeqRef.current, data: current },
        { kind: "event", event, seq: event.seq, selfActorId },
      );
      lastSeqRef.current = out.lastSeq;
      if (out.effect === "patch" && out.data !== undefined) {
        queryClient.setQueryData(key, out.data);
      } else if (out.effect === "invalidate") {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
    [queryClient, key, selfActorId],
  );

  useRealtimeChannel(dealMovedChannel(pipelineId), onFrame);
}
