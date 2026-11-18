import { describe, expect, it } from "vitest";
import { EMAIL_SNIPPET_MAX_CHARS } from "@/constants/email";
import { bodySnippet, decodeEmailSnippet } from "./snippetText";

describe("decodeEmailSnippet", () => {
  it("decodes the numeric apostrophe Gmail escapes into snippets", () => {
    expect(decodeEmailSnippet("Your message wasn&#39;t delivered")).toBe(
      "Your message wasn't delivered",
    );
  });

  it("decodes hex numeric references", () => {
    expect(decodeEmailSnippet("couldn&#x27;t be found")).toBe("couldn't be found");
  });

  it("decodes the named entities Gmail emits", () => {
    expect(decodeEmailSnippet("&quot;Q&amp;A&quot; &lt;tag&gt;")).toBe('"Q&A" <tag>');
  });

  it("turns a non-breaking space into a plain space", () => {
    expect(decodeEmailSnippet("Hi&nbsp;there")).toBe("Hi there");
  });

  it("decodes once, so an escaped entity stays visible instead of collapsing further", () => {
    expect(decodeEmailSnippet("&amp;#39;")).toBe("&#39;");
  });

  it("leaves an unknown entity untouched", () => {
    expect(decodeEmailSnippet("50&percnt; off &notreal;")).toBe("50&percnt; off &notreal;");
  });

  it("leaves an entity that collides with an inherited object property untouched", () => {
    expect(decodeEmailSnippet("&constructor; &toString;")).toBe("&constructor; &toString;");
  });

  it("passes null through", () => {
    expect(decodeEmailSnippet(null)).toBe(null);
  });
});

describe("bodySnippet", () => {
  it("strips tags, collapses whitespace and decodes entities", () => {
    expect(bodySnippet("<p>Hi&nbsp;there</p>\n<div>Bye &amp; thanks</div>")).toBe(
      "Hi there Bye & thanks",
    );
  });

  it("returns null for an empty or missing body", () => {
    expect(bodySnippet(null)).toBeNull();
    expect(bodySnippet("<br>  ")).toBeNull();
  });

  it("caps the snippet length", () => {
    expect(bodySnippet("x".repeat(EMAIL_SNIPPET_MAX_CHARS + 50))).toHaveLength(
      EMAIL_SNIPPET_MAX_CHARS,
    );
  });
});
