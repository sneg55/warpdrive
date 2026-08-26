import { describe, expect, it } from "vitest";
import { boardEmptyKind } from "./boardEmptyKind";

describe("boardEmptyKind", () => {
  it("is not empty at all while cards are showing", () => {
    expect(boardEmptyKind({ shownCount: 3, liveCount: 3, filtered: true })).toBe("none");
  });

  it("calls an unfiltered board with no cards an empty pipeline", () => {
    expect(boardEmptyKind({ shownCount: 0, liveCount: 0, filtered: false })).toBe("empty");
  });

  // The owner picker narrows on the client, so cards the server returned but the board is not
  // showing prove a filter hid something.
  it("blames the filter when the server returned cards the board is not showing", () => {
    expect(boardEmptyKind({ shownCount: 0, liveCount: 4, filtered: true })).toBe("filtered");
  });

  // The reported defect: a saved filter carried into a pipeline that has nothing in it. Both the
  // filter and an empty pipeline produce zero rows server-side, so neither can be asserted.
  it("does not blame the filter when the server itself returned nothing", () => {
    expect(boardEmptyKind({ shownCount: 0, liveCount: 0, filtered: true })).toBe("unsure");
  });
});
