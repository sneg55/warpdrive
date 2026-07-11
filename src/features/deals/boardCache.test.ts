import { describe, expect, it } from "vitest";
import { applyMove, removeCard, upsertCard } from "./boardCache";
import type { BoardCard } from "./dealRepo";

function card(id: string, stageId: string, pos: string): BoardCard {
  return {
    id,
    title: id,
    value: null,
    stageId,
    boardPosition: pos,
    ownerId: "u",
    personId: null,
    orgId: null,
    nextActivityAt: null,
    lastActivityAt: null,
    stageEnteredAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("boardCache", () => {
  it("moves a card to a new stage and re-sorts by position", () => {
    const data = {
      cards: [card("a", "s1", "1"), card("b", "s2", "1"), card("c", "s2", "3")],
    };
    const next = applyMove(data, {
      dealId: "a",
      toStageId: "s2",
      boardPosition: "2",
    });
    const s2 = next.cards.filter((c) => c.stageId === "s2").map((c) => c.id);
    expect(s2).toEqual(["b", "a", "c"]);
  });

  it("does not mutate the input when moving", () => {
    const data = {
      cards: [card("a", "s1", "1"), card("b", "s2", "1")],
    };
    const original = JSON.stringify(data);
    applyMove(data, {
      dealId: "a",
      toStageId: "s2",
      boardPosition: "2",
    });
    expect(JSON.stringify(data)).toBe(original);
  });

  it("removes a card", () => {
    const data = {
      cards: [card("a", "s1", "1"), card("b", "s1", "2")],
    };
    expect(removeCard(data, "a").cards.map((c) => c.id)).toEqual(["b"]);
  });

  it("adds a new card and sorts it", () => {
    const data = {
      cards: [card("a", "s1", "1"), card("b", "s1", "3")],
    };
    const newCard = card("c", "s1", "2");
    const next = upsertCard(data, newCard);
    expect(next.cards.map((c) => c.id)).toEqual(["a", "c", "b"]);
  });

  it("replaces an existing card and maintains sort", () => {
    const data = {
      cards: [card("a", "s1", "1"), card("b", "s1", "2"), card("c", "s1", "3")],
    };
    const updated = card("b", "s1", "1.5");
    const next = upsertCard(data, updated);
    expect(next.cards.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
});
