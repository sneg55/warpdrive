import { describe, expect, it } from "vitest";
import {
  dealCountLabel,
  incomingDealCounts,
  insertRowAt,
  insertRowBeside,
  nearestSavedStage,
  savedStagesExcept,
} from "./stageRemoval";

const rows = [
  { key: "s1", id: "s1", name: "A", dealCount: 2 },
  { key: "new-0", id: null, name: "New stage", dealCount: 0 },
  { key: "s3", id: "s3", name: "C", dealCount: 0 },
];

describe("savedStagesExcept", () => {
  it("drops unsaved rows and the row being deleted", () => {
    expect(savedStagesExcept(rows, "s1")).toEqual([{ id: "s3", name: "C" }]);
  });
});

describe("nearestSavedStage", () => {
  it("prefers the next saved stage, skipping unsaved ones", () => {
    expect(nearestSavedStage(rows, 0)).toBe("s3");
  });
  it("falls back to the previous saved stage at the end", () => {
    expect(nearestSavedStage(rows, 2)).toBe("s1");
  });
  it("returns null when no other saved stage exists", () => {
    expect(nearestSavedStage([rows[0]!, rows[1]!], 0)).toBeNull();
  });
});

describe("insertRowAt", () => {
  it("restores a row at its old index", () => {
    expect(insertRowAt(["a", "c"], 1, "b")).toEqual(["a", "b", "c"]);
  });
  it("clamps an index past the end", () => {
    expect(insertRowAt(["a"], 5, "b")).toEqual(["a", "b"]);
  });
});

describe("dealCountLabel", () => {
  it("reads naturally for zero, one, many and closed deals", () => {
    expect(dealCountLabel(0, 0)).toBe("No deals");
    expect(dealCountLabel(1, 0)).toBe("1 deal");
    expect(dealCountLabel(12, 3)).toBe("12 deals, 3 won or lost");
  });
});

describe("incomingDealCounts", () => {
  it("carries a source stage's own and incoming deals to its destination, in queue order", () => {
    const removed = {
      a: { dealCount: 2, closedDealCount: 1 },
      b: { dealCount: 3, closedDealCount: 0 },
    };
    const counts = incomingDealCounts(
      [
        { stageId: "a", moveDealsToStageId: "b" },
        { stageId: "b", moveDealsToStageId: "c" },
        { stageId: "x" },
      ],
      removed,
    );
    expect(counts).toEqual({
      b: { dealCount: 2, closedDealCount: 1 },
      c: { dealCount: 5, closedDealCount: 1 },
    });
  });
});

describe("insertRowBeside", () => {
  const a = { key: "a" };
  const b = { key: "b" };
  const c = { key: "c" };
  it("inserts after the previous neighbour when it survives", () => {
    expect(insertRowBeside([a, c], b, { prevKey: "a", nextKey: "c" })).toEqual([a, b, c]);
  });
  it("inserts before the next neighbour when the previous one is gone", () => {
    expect(insertRowBeside([c], b, { prevKey: "a", nextKey: "c" })).toEqual([b, c]);
  });
  it("appends when neither neighbour survives", () => {
    expect(insertRowBeside([a], b, { prevKey: "x", nextKey: "y" })).toEqual([a, b]);
  });
  it("prepends a row that had no previous neighbour and whose next one is gone", () => {
    expect(insertRowBeside([a], b, { prevKey: null, nextKey: "y" })).toEqual([b, a]);
  });
});
