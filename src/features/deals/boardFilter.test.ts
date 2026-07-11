import { describe, expect, it } from "vitest";
import { distinctBoardOwners, matchesOwnerFilter } from "./boardFilter";

const cards = [
  { ownerId: "u1", ownerName: "Bob Lee" },
  { ownerId: "u2", ownerName: "Ada King" },
  { ownerId: "u1", ownerName: "Bob Lee" },
  { ownerId: "u3", ownerName: null },
];

describe("distinctBoardOwners", () => {
  it("returns each owner present on the board once, sorted by name", () => {
    const owners = distinctBoardOwners(cards);
    expect(owners).toEqual([
      { ownerId: "u2", name: "Ada King" },
      { ownerId: "u1", name: "Bob Lee" },
      { ownerId: "u3", name: "Unknown" },
    ]);
  });

  it("returns an empty list when there are no cards", () => {
    expect(distinctBoardOwners([])).toEqual([]);
  });
});

describe("matchesOwnerFilter", () => {
  it("keeps every card when no owner is selected (Everyone)", () => {
    expect(matchesOwnerFilter(cards[0]!, null)).toBe(true);
  });

  it("keeps only the selected owner's cards", () => {
    expect(matchesOwnerFilter({ ownerId: "u1", ownerName: "Bob Lee" }, "u1")).toBe(true);
    expect(matchesOwnerFilter({ ownerId: "u2", ownerName: "Ada King" }, "u1")).toBe(false);
  });
});
