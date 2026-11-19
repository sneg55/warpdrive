import { describe, expect, it } from "vitest";
import { buildSearchPattern } from "./pattern";

describe("buildSearchPattern", () => {
  it("trims, lowercases and wraps the query for substring matching", () => {
    const p = buildSearchPattern("  PropDesk ");
    expect(p.lower).toBe("propdesk");
    expect(p.terms).toEqual([{ lower: "propdesk", contains: "%propdesk%" }]);
    expect(p.prefix).toBe("propdesk%");
  });

  it("escapes percent, underscore and backslash", () => {
    const p = buildSearchPattern("a%b_c\\d");
    expect(p.terms[0]?.contains).toBe("%a\\%b\\_c\\\\d%");
  });

  it("splits the query on whitespace into terms", () => {
    const p = buildSearchPattern("  Renewal   ACME\tq4 ");
    expect(p.terms.map((t) => t.lower)).toEqual(["renewal", "acme", "q4"]);
    expect(p.prefix).toBe("renewal%");
  });

  it("enables content search only for an alphanumeric run of 3 or more", () => {
    expect(buildSearchPattern("pro").searchContent).toBe(true);
    expect(buildSearchPattern("ab").searchContent).toBe(false);
    expect(buildSearchPattern("___").searchContent).toBe(false);
    expect(buildSearchPattern("a b c").searchContent).toBe(false);
    expect(buildSearchPattern("a b cde").searchContent).toBe(true);
    expect(buildSearchPattern("a.b-cde").searchContent).toBe(true);
    expect(buildSearchPattern("%%%").searchContent).toBe(false);
  });
});
