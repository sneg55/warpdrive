import { describe, expect, it } from "vitest";
import { linkifyHtml, tokenizeLinks } from "./linkify";

describe("tokenizeLinks with markdown-shaped text", () => {
  it("splits a markdown link whose label is itself a URL into two links", () => {
    const url = "https://x.com/JamesGarba16?t=FUM5lyZ_UHmfaKsLnK7mcA&s=09";
    expect(tokenizeLinks(`[${url}](${url})`)).toEqual([
      { kind: "text", value: "[" },
      { kind: "url", value: url, href: url },
      { kind: "text", value: "](" },
      { kind: "url", value: url, href: url },
      { kind: "text", value: ")" },
    ]);
  });

  it("stays linear on a long whitespace-free run of URL-labelled markdown links", () => {
    const run = "[https://a.io/x](https://a.io/x)".repeat(5_000);
    const started = performance.now();
    const urls = tokenizeLinks(run).filter((t) => t.kind === "url");
    expect(urls).toHaveLength(10_000);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("drops an unmatched closing bracket that wraps a URL in prose", () => {
    expect(tokenizeLinks("[see https://example.com]")).toEqual([
      { kind: "text", value: "[see " },
      { kind: "url", value: "https://example.com", href: "https://example.com" },
      { kind: "text", value: "]" },
    ]);
  });

  it("keeps ]( and )[ inside a plain URL that is not a markdown link", () => {
    const url = "https://example.com/search?expr=foo()[0]&b=a](c";
    expect(tokenizeLinks(`see ${url} now`)).toEqual([
      { kind: "text", value: "see " },
      { kind: "url", value: url, href: url },
      { kind: "text", value: " now" },
    ]);
  });

  it("keeps a parenthesised markdown target whole and links a plain label's URL only", () => {
    const target = "https://en.wikipedia.org/wiki/Foo_(bar)";
    expect(tokenizeLinks(`[Foo](${target}) and [x](/relative)`)).toEqual([
      { kind: "text", value: "[Foo](" },
      { kind: "url", value: target, href: target },
      { kind: "text", value: ") and [x](/relative)" },
    ]);
  });

  it("recognises a markdown link with a quoted title", () => {
    expect(tokenizeLinks('[https://label/x](https://target/x "Deck")')).toEqual([
      { kind: "text", value: "[" },
      { kind: "url", value: "https://label/x", href: "https://label/x" },
      { kind: "text", value: "](" },
      { kind: "url", value: "https://target/x", href: "https://target/x" },
      { kind: "text", value: ' "Deck")' },
    ]);
  });

  it("does not treat a markdown-shaped fragment inside a URL as a link boundary", () => {
    const url = "https://example.com/[a](b)/c";
    expect(tokenizeLinks(`see ${url}`)).toEqual([
      { kind: "text", value: "see " },
      { kind: "url", value: url, href: url },
    ]);
  });

  it("recognises an empty target, a parenthesised title, and an escaped quoted title", () => {
    expect(tokenizeLinks("[https://label/x]()")).toEqual([
      { kind: "text", value: "[" },
      { kind: "url", value: "https://label/x", href: "https://label/x" },
      { kind: "text", value: "]()" },
    ]);
    expect(tokenizeLinks("[https://label/x](https://target/x (Deck))")).toEqual([
      { kind: "text", value: "[" },
      { kind: "url", value: "https://label/x", href: "https://label/x" },
      { kind: "text", value: "](" },
      { kind: "url", value: "https://target/x", href: "https://target/x" },
      { kind: "text", value: " (Deck))" },
    ]);
    expect(tokenizeLinks("[https://label/x](https://target/x &quot;Deck&quot;)")).toEqual([
      { kind: "text", value: "[" },
      { kind: "url", value: "https://label/x", href: "https://label/x" },
      { kind: "text", value: "](" },
      { kind: "url", value: "https://target/x", href: "https://target/x" },
      { kind: "text", value: " &quot;Deck&quot;)" },
    ]);
  });

  it("links the label and target of a markdown link that follows punctuation or nests parens", () => {
    expect(tokenizeLinks(":[https://label/x](https://target/x_(foo_(bar)))")).toEqual([
      { kind: "text", value: ":[" },
      { kind: "url", value: "https://label/x", href: "https://label/x" },
      { kind: "text", value: "](" },
      {
        kind: "url",
        value: "https://target/x_(foo_(bar))",
        href: "https://target/x_(foo_(bar))",
      },
      { kind: "text", value: ")" },
    ]);
  });

  it("splits a markdown link whose label has text before its URL", () => {
    expect(tokenizeLinks("[see https://label/x](https://target/x) ok")).toEqual([
      { kind: "text", value: "[see " },
      { kind: "url", value: "https://label/x", href: "https://label/x" },
      { kind: "text", value: "](" },
      { kind: "url", value: "https://target/x", href: "https://target/x" },
      { kind: "text", value: ") ok" },
    ]);
  });

  it("keeps the label opener active through parentheses inside the label", () => {
    expect(tokenizeLinks("[See (https://label/x)](https://target/x)")).toEqual([
      { kind: "text", value: "[See (" },
      { kind: "url", value: "https://label/x", href: "https://label/x" },
      { kind: "text", value: ")](" },
      { kind: "url", value: "https://target/x", href: "https://target/x" },
      { kind: "text", value: ")" },
    ]);
  });
});

describe("linkifyHtml with markdown-shaped text", () => {
  it("splits a URL-labelled markdown link with an escaped title into two anchors", () => {
    expect(linkifyHtml("<p>[https://label/x](https://target/x &quot;Deck&quot;)</p>")).toBe(
      '<p>[<a href="https://label/x" target="_blank" rel="noopener noreferrer">https://label/x</a>](<a href="https://target/x" target="_blank" rel="noopener noreferrer">https://target/x</a> &quot;Deck&quot;)</p>',
    );
  });

  it("carries the markdown opener across an inline tag but not across a block boundary", () => {
    expect(linkifyHtml("<p>[<strong>see </strong>https://label/x](https://target/x)</p>")).toBe(
      '<p>[<strong>see </strong><a href="https://label/x" target="_blank" rel="noopener noreferrer">https://label/x</a>](<a href="https://target/x" target="_blank" rel="noopener noreferrer">https://target/x</a>)</p>',
    );
    expect(linkifyHtml("<p>[</p><p>https://label/x](https://target/x)</p>")).toBe(
      '<p>[</p><p><a href="https://label/x](https://target/x)" target="_blank" rel="noopener noreferrer">https://label/x](https://target/x)</a></p>',
    );
  });

  it("carries the markdown opener across an escaped entity boundary", () => {
    expect(linkifyHtml("<p>[see&nbsp;https://label/x](https://target/x)</p>")).toBe(
      '<p>[see&nbsp;<a href="https://label/x" target="_blank" rel="noopener noreferrer">https://label/x</a>](<a href="https://target/x" target="_blank" rel="noopener noreferrer">https://target/x</a>)</p>',
    );
  });
});
