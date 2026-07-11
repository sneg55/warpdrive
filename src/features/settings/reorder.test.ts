import { describe, expect, it } from "vitest";
import { moveInArray } from "./reorder";

describe("moveInArray", () => {
  it("swaps an item up one slot", () => {
    expect(moveInArray(["a", "b", "c"], 1, "up")).toEqual(["b", "a", "c"]);
  });

  it("swaps an item down one slot", () => {
    expect(moveInArray(["a", "b", "c"], 1, "down")).toEqual(["a", "c", "b"]);
  });

  it("is a no-op at the top edge", () => {
    expect(moveInArray(["a", "b", "c"], 0, "up")).toEqual(["a", "b", "c"]);
  });

  it("is a no-op at the bottom edge", () => {
    expect(moveInArray(["a", "b", "c"], 2, "down")).toEqual(["a", "b", "c"]);
  });

  it("returns a fresh array (does not mutate the input)", () => {
    const input = ["a", "b"];
    const out = moveInArray(input, 0, "down");
    expect(out).not.toBe(input);
    expect(input).toEqual(["a", "b"]);
  });
});
