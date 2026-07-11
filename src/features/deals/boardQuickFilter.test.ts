import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  type Condition,
  defaultOperatorForField,
  type FilterableCard,
  matchesCondition,
  operatorsForField,
} from "./boardQuickFilter";

// This module rides into the board/pipeline client bundle via boardConditions. Its field/operator
// unions are plain const arrays, not a zod schema, so it must not pull zod (~62 KB gzipped) in.
describe("boardQuickFilter bundle hygiene", () => {
  it("does not import zod", () => {
    const src = readFileSync(
      fileURLToPath(new URL("./boardQuickFilter.ts", import.meta.url)),
      "utf8",
    );
    expect(src).not.toMatch(/from ["']zod["']/);
  });
});

describe("operatorsForField / defaultOperatorForField", () => {
  it("text fields (title, orgName) offer contains/eq and default to contains", () => {
    for (const f of ["title", "orgName"] as const) {
      expect(operatorsForField(f)).toEqual(["contains", "eq"]);
      expect(defaultOperatorForField(f)).toBe("contains");
    }
  });
  it("the numeric value field offers comparisons and never defaults to a text op", () => {
    expect(operatorsForField("value")).toEqual(["gt", "lt", "eq"]);
    expect(defaultOperatorForField("value")).toBe("gt");
  });
});

const card: FilterableCard = {
  title: "Acme renewal",
  value: "25000",
  ownerId: "u1",
  orgName: "Apex Labs",
};

describe("matchesCondition", () => {
  it("title contains matches case-insensitively", () => {
    const cond: Condition = { field: "title", operator: "contains", value: "acme" };
    expect(matchesCondition(card, cond)).toBe(true);
    expect(matchesCondition({ ...card, title: "Globex" }, cond)).toBe(false);
  });

  it("organization contains matches the org name (what the card shows), case-insensitively", () => {
    const cond: Condition = { field: "orgName", operator: "contains", value: "apex" };
    expect(matchesCondition(card, cond)).toBe(true);
    expect(matchesCondition({ ...card, orgName: "Globex" }, cond)).toBe(false);
    // A card with no org never matches an org filter.
    expect(matchesCondition({ ...card, orgName: null }, cond)).toBe(false);
  });

  it("value gt / lt compares numerically", () => {
    expect(matchesCondition(card, { field: "value", operator: "gt", value: "10000" })).toBe(true);
    expect(matchesCondition(card, { field: "value", operator: "lt", value: "10000" })).toBe(false);
    expect(matchesCondition(card, { field: "value", operator: "lt", value: "30000" })).toBe(true);
  });

  it("eq compares the raw field string", () => {
    expect(matchesCondition(card, { field: "ownerId", operator: "eq", value: "u1" })).toBe(true);
    expect(matchesCondition(card, { field: "ownerId", operator: "eq", value: "u9" })).toBe(false);
  });

  it("a non-numeric gt/lt target never matches", () => {
    expect(matchesCondition(card, { field: "value", operator: "gt", value: "abc" })).toBe(false);
  });
});
