import { describe, expect, it } from "vitest";
import { isAllSelected, selectAll, toggleSelection } from "./useRowSelection";

describe("toggleSelection", () => {
  it("adds an id that is not selected", () => {
    const next = toggleSelection(new Set(), "a");
    expect([...next]).toEqual(["a"]);
  });

  it("removes an id that is already selected", () => {
    const next = toggleSelection(new Set(["a", "b"]), "a");
    expect([...next].sort()).toEqual(["b"]);
  });

  it("does not mutate the input set", () => {
    const input = new Set(["a"]);
    toggleSelection(input, "b");
    expect([...input]).toEqual(["a"]);
  });
});

describe("selectAll", () => {
  it("returns a set of every provided id", () => {
    expect([...selectAll(["a", "b", "c"])].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("isAllSelected", () => {
  it("is true when every visible id is selected", () => {
    expect(isAllSelected(new Set(["a", "b"]), ["a", "b"])).toBe(true);
  });

  it("is false when a visible id is missing", () => {
    expect(isAllSelected(new Set(["a"]), ["a", "b"])).toBe(false);
  });

  it("is false when there are no visible rows", () => {
    expect(isAllSelected(new Set(), [])).toBe(false);
  });

  it("ignores selected ids that are not visible", () => {
    expect(isAllSelected(new Set(["a", "b", "z"]), ["a", "b"])).toBe(true);
  });
});
