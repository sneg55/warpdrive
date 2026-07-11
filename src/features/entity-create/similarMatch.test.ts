import { describe, expect, it } from "vitest";
import { findSimilarOptions } from "./similarMatch";

const OPTS = [
  { id: "1", name: "Acme Inc" },
  { id: "2", name: "Beta LLC" },
  { id: "3", name: "test org" },
  { id: "4", name: "test lead org" },
];

describe("findSimilarOptions", () => {
  it("returns nothing for a blank or single-character query", () => {
    expect(findSimilarOptions(OPTS, "")).toEqual([]);
    expect(findSimilarOptions(OPTS, "a")).toEqual([]);
  });

  it("matches when an existing name contains the query", () => {
    const hits = findSimilarOptions(OPTS, "test").map((o) => o.id);
    expect(hits).toEqual(["3", "4"]);
  });

  it("matches when the query contains an existing name", () => {
    const hits = findSimilarOptions(OPTS, "Acme Inc International").map((o) => o.id);
    expect(hits).toEqual(["1"]);
  });

  it("ignores case and surrounding punctuation/whitespace", () => {
    const hits = findSimilarOptions(OPTS, "  ACME, INC.  ").map((o) => o.id);
    expect(hits).toEqual(["1"]);
  });

  it("matches a near-typo within a small edit distance", () => {
    // "beta llk" is one substitution from "beta llc"
    const hits = findSimilarOptions(OPTS, "beta llk").map((o) => o.id);
    expect(hits).toEqual(["2"]);
  });

  it("matches when two names share a distinctive first word", () => {
    // "Acme Global" is not a substring of "Acme Inc", but both start with "Acme".
    const hits = findSimilarOptions(OPTS, "Acme Global").map((o) => o.id);
    expect(hits).toEqual(["1"]);
  });

  it("does not match on a shared generic leading word like 'the'", () => {
    const opts = [{ id: "9", name: "The Beta Group" }];
    expect(findSimilarOptions(opts, "The Alpha Company")).toEqual([]);
  });

  it("returns nothing when no existing name is similar", () => {
    expect(findSimilarOptions(OPTS, "Globex Corporation")).toEqual([]);
  });

  it("does not treat two unrelated very short names as a near-typo", () => {
    // "GE" and "BP" are edit distance 2 apart, but 2-char names are too short to fuzzy-match.
    const opts = [{ id: "9", name: "BP" }];
    expect(findSimilarOptions(opts, "GE")).toEqual([]);
  });
});
