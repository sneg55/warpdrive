import { describe, expect, it } from "vitest";
import { renderSafeMarkdown } from "./markdown";

describe("renderSafeMarkdown (hostile fixtures)", () => {
  // Brief's original 4 fixtures

  it("strips a raw script tag", () => {
    const html = renderSafeMarkdown("hello <script>alert(1)</script> world");
    expect(html).not.toContain("<script");
    expect(html).toContain("hello");
  });

  it("drops a javascript: link scheme but keeps https links with rel/target", () => {
    const bad = renderSafeMarkdown("[x](javascript:alert(1))");
    expect(bad).not.toContain("javascript:");
    const good = renderSafeMarkdown("[ok](https://example.com)");
    expect(good).toContain('href="https://example.com"');
    expect(good).toContain('rel="noopener noreferrer"');
    expect(good).toContain('target="_blank"');
  });

  it("strips on* handler attributes from passthrough HTML", () => {
    const html = renderSafeMarkdown('<a href="https://x.com" onclick="evil()">x</a>');
    expect(html).not.toContain("onclick");
  });

  it("strips a non-https image source", () => {
    const html = renderSafeMarkdown("![a](http://insecure/img.png)");
    expect(html).not.toContain("<img");
  });

  // Additional hostile fixtures (defense in depth)

  it("drops a data: URI in a link", () => {
    const html = renderSafeMarkdown("[x](data:text/html;base64,PHNjcmlwdD4=)");
    expect(html).not.toContain("data:");
  });

  it("removes an iframe entirely including its content", () => {
    const html = renderSafeMarkdown('<iframe src="https://evil.com">steal</iframe>');
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("steal");
  });

  it("strips onerror from an img tag and keeps loading=lazy if img survives", () => {
    const html = renderSafeMarkdown('<img src="https://x/y.png" onerror="evil()">');
    expect(html).not.toContain("onerror");
    // if the img tag survived, it must have loading="lazy"
    if (html.includes("<img") === true) {
      expect(html).toContain('loading="lazy"');
    }
  });

  it("drops a style block entirely", () => {
    const html = renderSafeMarkdown("<style>body { display: none }</style>");
    expect(html).not.toContain("<style");
  });

  it("blocks mixed-case obfuscated javascript: scheme in a link", () => {
    const html = renderSafeMarkdown("[x](JaVaScRiPt:alert(1))");
    // sanitize-html lowercases schemes before checking allowlist
    expect(html.toLowerCase()).not.toContain("javascript:");
  });

  it("drops a protocol-relative href", () => {
    const html = renderSafeMarkdown("[x](//evil.com)");
    expect(html).not.toContain('href="//evil.com"');
  });
});
