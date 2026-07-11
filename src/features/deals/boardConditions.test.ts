import { expect, it } from "vitest";
import { applyConditions } from "./boardConditions";
import type { Condition } from "./boardQuickFilter";
import type { BoardCard } from "./dealRepo";

const cards = [
  { id: "a", title: "Big deal", value: "1000", ownerId: "u1" },
  { id: "b", title: "Small deal", value: "100", ownerId: "u1" },
] as BoardCard[];

it("returns all cards when there are no conditions", () => {
  expect(applyConditions(cards, [])).toHaveLength(2);
});

it("narrows to cards matching a value > N condition", () => {
  const cond: Condition = { field: "value", operator: "gt", value: "500" };
  const shown = applyConditions(cards, [cond]);
  expect(shown.map((c) => c.id)).toEqual(["a"]);
});

it("removing the condition restores all cards", () => {
  const cond: Condition = { field: "value", operator: "gt", value: "500" };
  expect(applyConditions(cards, [cond])).toHaveLength(1);
  expect(applyConditions(cards, [])).toHaveLength(2);
});

it("ignores an incomplete chip with an empty value (does not blank the board)", () => {
  const cond: Condition = { field: "value", operator: "gt", value: "" };
  expect(applyConditions(cards, [cond])).toHaveLength(2);
});
