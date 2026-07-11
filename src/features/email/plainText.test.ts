import { describe, expect, it } from "vitest";
import { plainTextToSafeHtml } from "./plainText";

describe("plainTextToSafeHtml", () => {
  it("returns empty string for blank input", () => {
    expect(plainTextToSafeHtml("")).toBe("");
    expect(plainTextToSafeHtml("   \n  ")).toBe("");
  });

  it("preserves newlines as <br>", () => {
    expect(plainTextToSafeHtml("a\nb\nc")).toBe("a<br>b<br>c");
  });

  it("normalizes CRLF and CR to <br>", () => {
    expect(plainTextToSafeHtml("a\r\nb\rc")).toBe("a<br>b<br>c");
  });

  it("escapes HTML so sender markup cannot become live HTML", () => {
    const out = plainTextToSafeHtml("<script>alert(1)</script> & <b>x</b>");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<b>");
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("&amp;");
  });

  it("auto-links http/https URLs, leaving trailing sentence punctuation outside the link", () => {
    const out = plainTextToSafeHtml("See https://example.com/a?b=1 for details.");
    expect(out).toContain(
      '<a href="https://example.com/a?b=1" target="_blank" rel="noopener noreferrer">https://example.com/a?b=1</a>',
    );
    const out2 = plainTextToSafeHtml("go to https://example.com.");
    expect(out2).toContain(">https://example.com</a>.");
  });

  it("auto-links bare email addresses as mailto:", () => {
    const out = plainTextToSafeHtml("Reply to support@hetzner.com now");
    expect(out).toContain('<a href="mailto:support@hetzner.com">support@hetzner.com</a>');
  });

  it("does not double-link an email that is part of a URL", () => {
    const out = plainTextToSafeHtml("https://x.com/u@host/page");
    // one anchor, the whole URL; no separate mailto for u@host
    expect(out).not.toContain("mailto:");
    expect((out.match(/<a /g) ?? []).length).toBe(1);
  });

  it("does not allow a javascript: scheme to be linkified (only http/https/mailto)", () => {
    const out = plainTextToSafeHtml("javascript:alert(1)");
    expect(out).not.toContain("<a ");
  });
});
