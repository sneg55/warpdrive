import { expect, it } from "vitest";
import { reorderByDrag } from "./reorderDrag";

it("moves the active id to the over id's position", () => {
  expect(reorderByDrag(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
  expect(reorderByDrag(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
});

it("returns an unchanged copy when the ids match or either is missing", () => {
  expect(reorderByDrag(["a", "b"], "a", "a")).toEqual(["a", "b"]);
  expect(reorderByDrag(["a", "b"], "x", "b")).toEqual(["a", "b"]);
  expect(reorderByDrag(["a", "b"], "a", "y")).toEqual(["a", "b"]);
});
