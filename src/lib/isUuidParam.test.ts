import { describe, expect, it } from "vitest";
import { isUuidParam } from "./isUuidParam";

// URL path params arrive as raw strings. A detail route's [id] segment is a uuid PK, but a user can
// type anything. This predicate is the guard that lets a repo treat a non-uuid id as "not found"
// instead of handing it to Postgres, which rejects the uuid cast and throws (a 500 that also leaks
// the SQL in dev). See leadRepo/getWorkspace/getPerson/getOrg.
describe("isUuidParam", () => {
  it("accepts a canonical v4 uuid", () => {
    expect(isUuidParam("9cc84465-b904-4963-951a-6a654604ed73")).toBe(true);
  });

  it("rejects a plainly non-uuid path segment", () => {
    expect(isUuidParam("inbox")).toBe(false);
    expect(isUuidParam("not-a-uuid")).toBe(false);
  });

  it("rejects the empty string", () => {
    expect(isUuidParam("")).toBe(false);
  });

  it("rejects a uuid with surrounding whitespace (no trimming, exact match only)", () => {
    expect(isUuidParam(" 9cc84465-b904-4963-951a-6a654604ed73 ")).toBe(false);
  });

  it("rejects a string that is uuid-shaped but too short", () => {
    expect(isUuidParam("9cc84465-b904-4963-951a-6a654604ed7")).toBe(false);
  });
});
