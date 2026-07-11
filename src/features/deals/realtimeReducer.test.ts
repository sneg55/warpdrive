import { describe, expect, it } from "vitest";
import type { BoardData } from "./boardCache";
import type { BoardCard } from "./dealRepo";
import { reduceRealtime } from "./realtimeReducer";

function card(id: string, stageId: string): BoardCard {
  return {
    id,
    title: id,
    value: null,
    stageId,
    boardPosition: "1",
    ownerId: "u",
    personId: null,
    orgId: null,
    nextActivityAt: null,
    lastActivityAt: null,
    stageEnteredAt: new Date(),
    updatedAt: new Date(),
  };
}

const data: BoardData = { cards: [card("a", "s1")] };
const movedEvent = {
  v: 1 as const,
  type: "deal_moved" as const,
  channel: "pipeline:1",
  ts: "2026-06-29T00:00:00.000Z",
  actorId: "u2",
  data: { dealId: "a", toStageId: "s2", boardPosition: "2" },
};

describe("reduceRealtime", () => {
  it("patches an in-order event from another actor", () => {
    const out = reduceRealtime(
      { lastSeq: 4, data },
      { kind: "event", event: movedEvent, seq: 5, selfActorId: "me" },
    );
    expect(out.effect).toBe("patch");
    expect(out.data?.cards[0]?.stageId).toBe("s2");
    expect(out.lastSeq).toBe(5);
  });

  it("invalidates on a seq gap", () => {
    const out = reduceRealtime(
      { lastSeq: 4, data },
      { kind: "event", event: movedEvent, seq: 7, selfActorId: "me" },
    );
    expect(out.effect).toBe("invalidate");
  });

  it("ignores an echo of the client own action but still advances lastSeq", () => {
    const out = reduceRealtime(
      { lastSeq: 4, data },
      {
        kind: "event",
        event: { ...movedEvent, actorId: "me" },
        seq: 5,
        selfActorId: "me",
      },
    );
    expect(out.effect).toBe("ignore");
    expect(out.lastSeq).toBe(5);
  });

  it("invalidates a self-actor deal_updated (delete/archive), which the board never applied optimistically", () => {
    // Delete/archive originate from the deal workspace, not the board, so there is no local
    // optimistic apply to echo-suppress. The acting user's own board must still refetch to drop
    // the card. Echo suppression is reserved for deal_moved (the only board-optimistic action).
    const updatedEvent = {
      ...movedEvent,
      type: "deal_updated" as const,
      actorId: "me",
      data: { dealId: "a", pipelineId: "1" },
    };
    const out = reduceRealtime(
      { lastSeq: 4, data },
      { kind: "event", event: updatedEvent, seq: 5, selfActorId: "me" },
    );
    expect(out.effect).toBe("invalidate");
  });

  it("invalidates on a resync frame", () => {
    expect(reduceRealtime({ lastSeq: 4, data }, { kind: "resync" }).effect).toBe("invalidate");
  });

  it("ignores a duplicate or out-of-order seq", () => {
    const out = reduceRealtime(
      { lastSeq: 4, data },
      { kind: "event", event: movedEvent, seq: 4, selfActorId: "me" },
    );
    expect(out.effect).toBe("ignore");
    expect(out.lastSeq).toBe(4);
  });

  describe("first-event off-by-one (lastSeq init -1)", () => {
    it("applies the first event (seq=0) from lastSeq=-1", () => {
      const out = reduceRealtime(
        { lastSeq: -1, data },
        { kind: "event", event: movedEvent, seq: 0, selfActorId: "me" },
      );
      expect(out.effect).toBe("patch");
      expect(out.lastSeq).toBe(0);
      expect(out.data?.cards[0]?.stageId).toBe("s2");
    });

    it("applies the second event (seq=1) after the first (lastSeq=0)", () => {
      const data2: BoardData = { cards: [card("a", "s2")] };
      const event2 = {
        ...movedEvent,
        data: { dealId: "a", toStageId: "s3", boardPosition: "3" },
      };
      const out = reduceRealtime(
        { lastSeq: 0, data: data2 },
        { kind: "event", event: event2, seq: 1, selfActorId: "me" },
      );
      expect(out.effect).toBe("patch");
      expect(out.lastSeq).toBe(1);
    });

    it("ignores a repeated seq=0 after it was already applied (lastSeq=0)", () => {
      const out = reduceRealtime(
        { lastSeq: 0, data },
        { kind: "event", event: movedEvent, seq: 0, selfActorId: "me" },
      );
      expect(out.effect).toBe("ignore");
      expect(out.lastSeq).toBe(0);
    });
  });
});
