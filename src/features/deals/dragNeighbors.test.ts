import { describe, expect, it } from "vitest";
import type { BoardCard } from "./dealRepo";
import { resolveNeighbors } from "./dragNeighbors";

function card(id: string, pos: string): BoardCard {
  return {
    id,
    title: id,
    value: null,
    stageId: "s",
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

const cards = [card("a", "1"), card("b", "2"), card("c", "3")];

describe("resolveNeighbors", () => {
  it("top of column: no before, after is first card position", () => {
    expect(resolveNeighbors(cards, 0)).toEqual({ beforePosition: null, afterPosition: "1" });
  });

  it("between two cards: before and after are the surrounding positions", () => {
    expect(resolveNeighbors(cards, 1)).toEqual({ beforePosition: "1", afterPosition: "2" });
  });

  it("middle between second and third", () => {
    expect(resolveNeighbors(cards, 2)).toEqual({ beforePosition: "2", afterPosition: "3" });
  });

  it("bottom of column: before is last card position, no after", () => {
    expect(resolveNeighbors(cards, 3)).toEqual({ beforePosition: "3", afterPosition: null });
  });

  it("empty column: both null", () => {
    expect(resolveNeighbors([], 0)).toEqual({ beforePosition: null, afterPosition: null });
  });

  it("single-card column: drop at top gives no before, after is the card", () => {
    const single = [card("x", "5")];
    expect(resolveNeighbors(single, 0)).toEqual({ beforePosition: null, afterPosition: "5" });
  });

  it("single-card column: drop at bottom gives before is the card, no after", () => {
    const single = [card("x", "5")];
    expect(resolveNeighbors(single, 1)).toEqual({ beforePosition: "5", afterPosition: null });
  });
});
