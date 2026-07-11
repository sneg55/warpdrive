import { describe, expect, it } from "vitest";
import { MERGE_TOKEN_FIELDS, mergeTokenPlaceholder } from "./mergeTokens";

// The template editor may only offer a merge token that the send-time context (mergeContext.ts)
// can actually resolve. This is the exhaustive set those put(ctx, ...) calls produce; if
// mergeContext gains or drops a token, update BOTH and this test guards the pairing.
const PRODUCIBLE_TOKENS = new Set([
  "person.name",
  "person.first_name",
  "person.last_name",
  "person.email",
  "deal.title",
  "deal.value",
  "org.name",
]);

describe("MERGE_TOKEN_FIELDS", () => {
  it("only offers tokens that mergeContext can resolve at send time", () => {
    for (const f of MERGE_TOKEN_FIELDS) {
      expect(PRODUCIBLE_TOKENS.has(f.token)).toBe(true);
    }
  });

  it("offers every producible token (no send-time token is unreachable from the UI)", () => {
    const offered = new Set(MERGE_TOKEN_FIELDS.map((f) => f.token));
    for (const token of PRODUCIBLE_TOKENS) {
      expect(offered.has(token)).toBe(true);
    }
  });

  it("gives every field a non-empty human label", () => {
    for (const f of MERGE_TOKEN_FIELDS) {
      expect(f.label.length).toBeGreaterThan(0);
    }
  });

  it("wraps a token as a {{token}} placeholder", () => {
    expect(mergeTokenPlaceholder("person.name")).toBe("{{person.name}}");
  });
});
