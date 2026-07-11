// Pure reducer: gap detection (ops spec A4), echo suppression, cache patching.
// No I/O, no sockets. Tested in isolation; useBoardRealtime wires it into the cache.
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

// Gap detection per ops A4: a seq jump or resync forces a full invalidate so the
// client re-fetches current server state. An echo of the client's own optimistic
// action is suppressed (no double-apply) but still advances lastSeq. Everything
// else patches the cache in place and advances lastSeq.
export function reduceRealtime(state: RealtimeState, action: RealtimeAction): RealtimeResult {
  if (action.kind === "resync") {
    return { lastSeq: state.lastSeq, effect: "invalidate" };
  }

  const { event, seq, selfActorId } = action;

  // Out-of-order or duplicate: discard without advancing seq.
  if (seq <= state.lastSeq) {
    return { lastSeq: state.lastSeq, effect: "ignore" };
  }

  // Gap: missed at least one event, full refetch required.
  if (seq > state.lastSeq + 1) {
    return { lastSeq: seq, effect: "invalidate" };
  }

  // Echo suppression: the actor already applied this optimistically; advancing
  // lastSeq prevents a subsequent in-order event from being mistaken for a gap.
  // Only deal_moved is applied optimistically on the board, so it is the only self
  // event to suppress. deal_created/deal_updated (including delete/archive, which
  // originate off-board) have no local optimistic apply, so a self event must still
  // invalidate or the acting user's own board keeps a stale card.
  if (event.actorId === selfActorId && event.type === BOARD_EVENT.dealMoved) {
    return { lastSeq: seq, effect: "ignore" };
  }

  // seq === lastSeq + 1 and not self: apply the event.
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

  // deal_created / deal_updated: payload carries IDs only (no full card), so a
  // full refetch is the correct and safe choice.
  return { lastSeq: seq, effect: "invalidate" };
}
