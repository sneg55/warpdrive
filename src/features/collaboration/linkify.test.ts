import { describe, expect, it } from "vitest";
import { linkifyHtml, tokenizeLinks } from "./linkify";

describe("tokenizeLinks", () => {
  it("returns a single text token for text without links", () => {
    expect(tokenizeLinks("Called the buyer")).toEqual([
      { kind: "text", value: "Called the buyer" },
    ]);
  });

  it("splits a URL out of surrounding text, keeping trailing punctuation as text", () => {
    expect(tokenizeLinks("See https://example.com/a?b=1, then call.")).toEqual([
      { kind: "text", value: "See " },
      { kind: "url", value: "https://example.com/a?b=1", href: "https://example.com/a?b=1" },
      { kind: "text", value: ", then call." },
    ]);
  });

  it("links a bare email as mailto", () => {
    expect(tokenizeLinks("ping a@b.co now")).toEqual([
      { kind: "text", value: "ping " },
      { kind: "email", value: "a@b.co", href: "mailto:a@b.co" },
      { kind: "text", value: " now" },
    ]);
  });

  it("does not link an email that is part of a URL", () => {
    expect(tokenizeLinks("https://x.com/u@host/page")).toEqual([
      { kind: "url", value: "https://x.com/u@host/page", href: "https://x.com/u@host/page" },
    ]);
  });

  it("keeps a balanced closing paren inside the URL and strips only an unmatched one", () => {
    expect(tokenizeLinks("https://en.wikipedia.org/wiki/Function_(mathematics)")).toEqual([
      {
        kind: "url",
        value: "https://en.wikipedia.org/wiki/Function_(mathematics)",
        href: "https://en.wikipedia.org/wiki/Function_(mathematics)",
      },
    ]);
    expect(tokenizeLinks("(see https://example.com/a).")).toEqual([
      { kind: "text", value: "(see " },
      { kind: "url", value: "https://example.com/a", href: "https://example.com/a" },
      { kind: "text", value: ")." },
    ]);
  });

  it("stops a URL at a quote so quoted text cannot ride into the link", () => {
    expect(tokenizeLinks('go "https://example.com/x" now')).toEqual([
      { kind: "text", value: 'go "' },
      { kind: "url", value: "https://example.com/x", href: "https://example.com/x" },
      { kind: "text", value: '" now' },
    ]);
  });

  it("matches the scheme case-insensitively", () => {
    expect(tokenizeLinks("HTTPS://user@example.com/path")).toEqual([
      {
        kind: "url",
        value: "HTTPS://user@example.com/path",
        href: "HTTPS://user@example.com/path",
      },
    ]);
  });

  it("stays linear on long runs of email-local characters and trailing delimiters", () => {
    const run = "a".repeat(200_000);
    const parens = `https://example.com/x${")".repeat(50_000)}`;
    const started = performance.now();
    expect(tokenizeLinks(run)).toEqual([{ kind: "text", value: run }]);
    expect(tokenizeLinks(parens)[0]).toEqual({
      kind: "url",
      value: "https://example.com/x",
      href: "https://example.com/x",
    });
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("stops a URL at a typographic closing quote", () => {
    expect(tokenizeLinks("see “https://example.com” now")).toEqual([
      { kind: "text", value: "see “" },
      { kind: "url", value: "https://example.com", href: "https://example.com" },
      { kind: "text", value: "” now" },
    ]);
  });

  it("keeps an apostrophe inside a URL path but drops a wrapping one", () => {
    expect(tokenizeLinks("https://example.com/O'Connor")).toEqual([
      { kind: "url", value: "https://example.com/O'Connor", href: "https://example.com/O'Connor" },
    ]);
    expect(tokenizeLinks("'https://example.com'")).toEqual([
      { kind: "text", value: "'" },
      { kind: "url", value: "https://example.com", href: "https://example.com" },
      { kind: "text", value: "'" },
    ]);
  });

  it("keeps array-style query brackets inside a URL", () => {
    const url = "https://example.com/search?filter[]=open&ids[0]=7";
    expect(tokenizeLinks(`see ${url}`)).toEqual([
      { kind: "text", value: "see " },
      { kind: "url", value: url, href: url },
    ]);
  });

  it("keeps square brackets inside a URL, such as an IPv6 host", () => {
    expect(tokenizeLinks("dev at http://[::1]:3000/path ok")).toEqual([
      { kind: "text", value: "dev at " },
      { kind: "url", value: "http://[::1]:3000/path", href: "http://[::1]:3000/path" },
      { kind: "text", value: " ok" },
    ]);
  });

  it("leaves javascript: and scheme-less www text alone", () => {
    expect(tokenizeLinks("javascript:alert(1) www.example.com")).toEqual([
      { kind: "text", value: "javascript:alert(1) www.example.com" },
    ]);
  });
});

describe("linkifyHtml", () => {
  it("wraps a bare URL in sanitized HTML text with an anchor", () => {
    expect(linkifyHtml("<p>agenda: https://example.com/x.</p>")).toBe(
      '<p>agenda: <a href="https://example.com/x" target="_blank" rel="noopener noreferrer">https://example.com/x</a>.</p>',
    );
  });

  it("does not nest an anchor inside an existing anchor", () => {
    const html = '<p><a href="https://example.com">https://example.com</a></p>';
    expect(linkifyHtml(html)).toBe(html);
  });

  it("never touches tag markup, only text between tags", () => {
    const html = '<p style="color:#000"><img src="https://img.example/a.png" alt="x"></p>';
    expect(linkifyHtml(html)).toBe(html);
  });

  it("cannot be used to smuggle an attribute through a quote in URL text", () => {
    expect(linkifyHtml('<p>https://example.com/"onmouseover="alert(1)"x="</p>')).toBe(
      '<p><a href="https://example.com/" target="_blank" rel="noopener noreferrer">https://example.com/</a>"onmouseover="alert(1)"x="</p>',
    );
  });

  it("does not treat a > inside a quoted attribute value as the end of the tag", () => {
    const html = '<p title="x > https://example.com/z">plain</p>';
    expect(linkifyHtml(html)).toBe(html);
  });

  it("treats a serialized non-breaking space as a URL boundary", () => {
    expect(linkifyHtml("<p>https://example.com&nbsp;next</p>")).toBe(
      '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a>&nbsp;next</p>',
    );
  });

  it("treats escaped angle brackets around a URL as boundaries", () => {
    expect(linkifyHtml("<p>&lt;https://example.com&gt;</p>")).toBe(
      '<p>&lt;<a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a>&gt;</p>',
    );
  });

  it("keeps an escaped apostrophe inside a URL path but drops a wrapping one", () => {
    expect(linkifyHtml("<p>https://example.com/O&#39;Connor</p>")).toBe(
      '<p><a href="https://example.com/O&#39;Connor" target="_blank" rel="noopener noreferrer">https://example.com/O&#39;Connor</a></p>',
    );
    expect(linkifyHtml("<p>&#39;https://example.com&#39;</p>")).toBe(
      '<p>&#39;<a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a>&#39;</p>',
    );
  });

  it("opens email links in a new tab when asked", () => {
    expect(linkifyHtml("<p>ann@example.com</p>", { emailNewTab: true })).toBe(
      '<p><a href="mailto:ann@example.com" target="_blank" rel="noopener noreferrer">ann@example.com</a></p>',
    );
  });

  it("keeps entity-escaped text as-is inside the link", () => {
    expect(linkifyHtml("<p>https://e.com/?a=1&amp;b=2</p>")).toBe(
      '<p><a href="https://e.com/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">https://e.com/?a=1&amp;b=2</a></p>',
    );
  });
});
