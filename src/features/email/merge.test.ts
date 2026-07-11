import { describe, expect, it } from "vitest";
import { applyMergeFields } from "./merge";

describe("applyMergeFields", () => {
  it("substitutes known fields", () => {
    expect(applyMergeFields("Hi {{person.name}}", { "person.name": "Jane" })).toBe("Hi Jane");
  });
  it("blanks unknown fields", () => {
    expect(applyMergeFields("Hi {{person.unknown}}!", {})).toBe("Hi !");
  });
});
