import { describe, expect, it } from "vitest";
import { sortBoardCards } from "./boardSort";
import type { BoardCard } from "./dealRepo";

// Minimal BoardCard factory: only the fields a sort reads need meaningful values.
function card(over: Partial<BoardCard>): BoardCard {
  return {
    id: "id",
    title: "",
    value: null,
    stageId: "s1",
    boardPosition: "a",
    ownerId: "o1",
    personId: null,
    orgId: null,
    ownerName: null,
    personName: null,
    orgName: null,
    nextActivityAt: null,
    lastActivityAt: null,
    stageEnteredAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  };
}

describe("sortBoardCards", () => {
  it("sorts by title ascending and descending (case-insensitive)", () => {
    const cards = [
      card({ id: "1", title: "banana" }),
      card({ id: "2", title: "Apple" }),
      card({ id: "3", title: "cherry" }),
    ];
    expect(sortBoardCards(cards, "title", "asc").map((c) => c.id)).toEqual(["2", "1", "3"]);
    expect(sortBoardCards(cards, "title", "desc").map((c) => c.id)).toEqual(["3", "1", "2"]);
  });

  it("sorts by value numerically, not lexically", () => {
    const cards = [
      card({ id: "1", value: "9" }),
      card({ id: "2", value: "100" }),
      card({ id: "3", value: "20" }),
    ];
    expect(sortBoardCards(cards, "value", "asc").map((c) => c.id)).toEqual(["1", "3", "2"]);
  });

  it("keeps empty values last regardless of direction", () => {
    const cards = [
      card({ id: "1", value: null }),
      card({ id: "2", value: "50" }),
      card({ id: "3", value: "10" }),
    ];
    expect(sortBoardCards(cards, "value", "asc").map((c) => c.id)).toEqual(["3", "2", "1"]);
    expect(sortBoardCards(cards, "value", "desc").map((c) => c.id)).toEqual(["2", "3", "1"]);
  });

  it("sorts by next activity date, nulls last", () => {
    const cards = [
      card({ id: "1", nextActivityAt: null }),
      card({ id: "2", nextActivityAt: new Date("2026-03-01T00:00:00Z") }),
      card({ id: "3", nextActivityAt: new Date("2026-02-01T00:00:00Z") }),
    ];
    expect(sortBoardCards(cards, "nextActivity", "asc").map((c) => c.id)).toEqual(["3", "2", "1"]);
  });

  it("sorts by linked person and organization names, nulls last", () => {
    const cards = [
      card({ id: "1", personName: null }),
      card({ id: "2", personName: "Zoe" }),
      card({ id: "3", personName: "Amy" }),
    ];
    expect(sortBoardCards(cards, "person", "asc").map((c) => c.id)).toEqual(["3", "2", "1"]);
  });

  it("breaks ties deterministically by id so order never jitters", () => {
    const cards = [
      card({ id: "b", title: "same" }),
      card({ id: "a", title: "same" }),
      card({ id: "c", title: "same" }),
    ];
    expect(sortBoardCards(cards, "title", "asc").map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input array", () => {
    const cards = [card({ id: "1", title: "b" }), card({ id: "2", title: "a" })];
    const snapshot = cards.map((c) => c.id);
    sortBoardCards(cards, "title", "asc");
    expect(cards.map((c) => c.id)).toEqual(snapshot);
  });
});
