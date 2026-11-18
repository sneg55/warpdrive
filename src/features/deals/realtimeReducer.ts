import { BOARD_EVENT } from "@/constants/boardChannels";
import type { BoardEvent } from "@/server/realtime/events";
import { applyMove, type BoardData } from "./boardCache";

export type RealtimeAction =
  | { kind: "event"; event: BoardEvent; seq: number; selfActorId: string }
  | { kind: "resync" };

interface RealtimeState {
  lastSeq: number;
  data: BoardData;
}

export interface RealtimeResult {
  lastSeq: number;
  effect: "patch" | "invalidate" | "ignore";
  data?: BoardData;
}

export function reduceRealtime(state: RealtimeState, action: RealtimeAction): RealtimeResult {
  if (action.kind === "resync") {
    return { lastSeq: state.lastSeq, effect: "invalidate" };
  }

  const { event, seq, selfActorId } = action;

  if (seq <= state.lastSeq) {
    return { lastSeq: state.lastSeq, effect: "ignore" };
  }

  if (seq > state.lastSeq + 1) {
    return { lastSeq: seq, effect: "invalidate" };
  }

  if (event.actorId === selfActorId && event.type === BOARD_EVENT.dealMoved) {
    return { lastSeq: seq, effect: "ignore" };
  }

  if (
    event.type === BOARD_EVENT.dealMoved &&
    event.data.toStageId !== undefined &&
    event.data.boardPosition !== undefined
  ) {
    const patched = applyMove(state.data, {
      dealId: event.data.dealId,
      toStageId: event.data.toStageId,
      boardPosition: event.data.boardPosition,
    });
    return { lastSeq: seq, effect: "patch", data: patched };
  }

  return { lastSeq: seq, effect: "invalidate" };
}
