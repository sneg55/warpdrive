import { describe, expect, it } from "vitest";
import { parseMentions } from "./parse";

describe("parseMentions", () => {
  it("extracts userId tokens", () => {
    const body = "Hey @[Jane Roe](11111111-1111-1111-1111-111111111111) please review";
    expect(parseMentions(body)).toEqual([
      { userId: "11111111-1111-1111-1111-111111111111", display: "Jane Roe" },
    ]);
  });

  it("dedups repeated mentions of the same user", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    const body = `@[A](${id}) and again @[A](${id})`;
    expect(parseMentions(body)).toHaveLength(1);
  });

  it("ignores malformed tokens and plain @text", () => {
    expect(parseMentions("email me @jane or @[Bad](not-a-uuid)")).toEqual([]);
  });
});
