import { describe, expect, it } from "vitest";
import type { ContactPoint } from "@/types/contactPoint";
import {
  appendPoint,
  committedPoints,
  orderedPoints,
  parsePoints,
  removePointAt,
  serializePoints,
  setPrimaryAt,
  setValueAt,
} from "./contactPoints";

const point = (value: string, primary = false, label = "work"): ContactPoint => ({
  label,
  value,
  primary,
});

describe("orderedPoints", () => {
  it("puts the primary first and keeps the rest in stored order", () => {
    const points = [point("a@x.com"), point("b@x.com", true), point("c@x.com")];
    expect(orderedPoints(points).map((p) => p.value)).toEqual(["b@x.com", "a@x.com", "c@x.com"]);
  });

  it("drops blank values", () => {
    expect(orderedPoints([point("  "), point("a@x.com", true)]).map((p) => p.value)).toEqual([
      "a@x.com",
    ]);
  });

  it("folds in a primary held only in the column, case-insensitively", () => {
    expect(orderedPoints([point("b@x.com")], "A@X.com").map((p) => p.value)).toEqual([
      "A@X.com",
      "b@x.com",
    ]);
    expect(orderedPoints([point("A@x.com")], "a@x.com").map((p) => p.value)).toEqual(["A@x.com"]);
  });

  it("promotes the entry the standalone primary names when no entry carries the flag", () => {
    const points = [point("b@x.com"), point("a@x.com")];
    expect(orderedPoints(points, "A@X.com").map((p) => [p.value, p.primary])).toEqual([
      ["a@x.com", true],
      ["b@x.com", false],
    ]);
  });

  it("treats the first point as primary when no entry carries the flag", () => {
    expect(orderedPoints([point("a@x.com"), point("b@x.com")])[0]?.primary).toBe(true);
  });
});

describe("draft round-trip", () => {
  it("parses back what it serialized", () => {
    const points = [point("a@x.com", true), point("b@x.com", false, "home")];
    expect(parsePoints(serializePoints(points))).toEqual(points);
  });

  it("returns an empty list for an unparseable draft", () => {
    expect(parsePoints("not json")).toEqual([]);
    expect(parsePoints("")).toEqual([]);
    expect(parsePoints('{"nope":1}')).toEqual([]);
  });
});

describe("row operations", () => {
  const rows = [point("a@x.com", true), point("b@x.com")];

  it("edits one row's value and leaves the others alone", () => {
    expect(setValueAt(rows, 1, "z@x.com")).toEqual([point("a@x.com", true), point("z@x.com")]);
  });

  it("removes a row", () => {
    expect(removePointAt(rows, 0)).toEqual([point("b@x.com")]);
  });

  it("promotes one row and demotes the previous primary", () => {
    expect(setPrimaryAt(rows, 1)).toEqual([point("a@x.com", false), point("b@x.com", true)]);
  });

  it("appends a blank row, primary only when it is the first", () => {
    expect(appendPoint(rows).at(-1)).toEqual(point("", false));
    expect(appendPoint([])).toEqual([point("", true)]);
  });
});

describe("committedPoints", () => {
  it("trims values and drops blank rows", () => {
    expect(committedPoints([point(" a@x.com ", true), point("  ")])).toEqual([
      point("a@x.com", true),
    ]);
  });

  it("promotes the first row when removing the primary left none", () => {
    expect(committedPoints([point("a@x.com"), point("b@x.com")])).toEqual([
      point("a@x.com", true),
      point("b@x.com", false),
    ]);
  });

  it("keeps exactly one primary", () => {
    expect(
      committedPoints([point("a@x.com", true), point("b@x.com", true)]).map((p) => p.primary),
    ).toEqual([true, false]);
  });
});
