import { describe, expect, it } from "vitest";
import { sanitizeAuthorHtml, sanitizeInboundHtml } from "./sanitizeHtml";

describe("sanitizeAuthorHtml", () => {
  it("keeps safe rich text", () => {
    expect(sanitizeAuthorHtml('<b>Hi</b> <a href="https://x.com">link</a>')).toContain("<b>Hi</b>");
  });

  it("strips script tags", () => {
    const out = sanitizeAuthorHtml("<script>alert(2)</script><p>safe</p>");
    expect(out).not.toMatch(/<script/i);
    expect(out).toContain("<p>safe</p>");
  });

  it("strips on* event handler attributes", () => {
    const out = sanitizeAuthorHtml('<img src="x" onerror="alert(1)">');
    expect(out).not.toMatch(/onerror/i);
  });

  it("strips javascript: URLs from href", () => {
    expect(sanitizeAuthorHtml('<a href="javascript:alert(1)">x</a>')).not.toMatch(/javascript:/i);
  });

  it("strips data: URLs from href", () => {
    expect(
      sanitizeAuthorHtml('<a href="data:text/html,<script>alert(1)</script>">x</a>'),
    ).not.toMatch(/data:/i);
  });

  it("strips <style> blocks", () => {
    const out = sanitizeAuthorHtml("<style>body{background:red}</style><b>text</b>");
    expect(out).not.toMatch(/<style/i);
    expect(out).toContain("<b>text</b>");
  });

  it("strips <form> elements", () => {
    const out = sanitizeAuthorHtml('<form action="/steal"><input name="pw"><b>text</b></form>');
    expect(out).not.toMatch(/<form/i);
  });

  it("strips svg-wrapped script (adversarial)", () => {
    const out = sanitizeAuthorHtml("<svg><script>alert(1)</script></svg>");
    expect(out).not.toMatch(/<script/i);
  });

  it("strips mixed-case ScRiPt tags (adversarial)", () => {
    const out = sanitizeAuthorHtml("<ScRiPt>alert(1)</ScRiPt>");
    expect(out).not.toMatch(/<script/i);
  });

  // Spec 6.5: inline styles from font-family/font-size/color TipTap extensions
  // must survive sanitisation so formatted email bodies render correctly.

  it("preserves font-family and color inline styles on span", () => {
    const out = sanitizeAuthorHtml('<span style="font-family:Arial;color:#ff0000">hi</span>');
    expect(out).toContain("font-family");
    expect(out).toContain("color");
    expect(out).toContain("hi");
  });

  it("preserves font-size inline style", () => {
    const out = sanitizeAuthorHtml('<span style="font-size:18px">big</span>');
    expect(out).toContain("font-size");
  });

  it("strips disallowed CSS property position:fixed from style attribute", () => {
    const out = sanitizeAuthorHtml('<span style="position:fixed;color:red">x</span>');
    expect(out).not.toContain("position");
    // Allowed property should still survive
    expect(out).toContain("color");
  });

  it("strips background:url(...) from style attribute", () => {
    const out = sanitizeAuthorHtml('<span style="background:url(x)">x</span>');
    expect(out).not.toMatch(/url\(/i);
  });

  it("strips CSS expression() from style attribute", () => {
    const out = sanitizeAuthorHtml('<span style="width:expression(alert(1))">x</span>');
    expect(out).not.toMatch(/expression\(/i);
  });

  it("still strips script tags even when style is allowed", () => {
    const out = sanitizeAuthorHtml('<script>evil()</script><span style="color:blue">ok</span>');
    expect(out).not.toMatch(/<script/i);
    expect(out).toContain("color");
  });

  it("still strips on* event handlers even when style is allowed", () => {
    const out = sanitizeAuthorHtml('<span style="color:red" onmouseover="evil()">x</span>');
    expect(out).not.toMatch(/onmouseover/i);
    expect(out).toContain("color");
  });
});

describe("sanitizeInboundHtml", () => {
  it("removes iframes and forms from hostile inbound mail", () => {
    const out = sanitizeInboundHtml('<iframe src="evil"></iframe><form><input></form><p>ok</p>', {
      allowRemote: false,
    });
    expect(out).not.toMatch(/<iframe/i);
    expect(out).not.toMatch(/<form/i);
    expect(out).toContain("<p>ok</p>");
  });

  it("blocks remote images when allowRemote is false", () => {
    const out = sanitizeInboundHtml('<img src="https://tracker.example/p.gif">', {
      allowRemote: false,
    });
    expect(out).not.toMatch(/tracker\.example/);
  });

  it("allows remote images when the user opts in", () => {
    const out = sanitizeInboundHtml('<img src="https://cdn.example/a.png">', { allowRemote: true });
    expect(out).toMatch(/cdn\.example/);
  });

  it("strips object and embed tags (adversarial embed)", () => {
    const out = sanitizeInboundHtml(
      '<object data="evil.swf"></object><embed src="evil.swf"><p>ok</p>',
      { allowRemote: true },
    );
    expect(out).not.toMatch(/<object/i);
    expect(out).not.toMatch(/<embed/i);
  });

  it("strips on* handlers even in inbound mode", () => {
    const out = sanitizeInboundHtml('<p onmouseover="steal()">text</p>', { allowRemote: true });
    expect(out).not.toMatch(/onmouseover/i);
    expect(out).toContain("text");
  });

  it("strips data:text/html URLs in inbound (adversarial)", () => {
    const out = sanitizeInboundHtml('<a href="data:text/html,<h1>phish</h1>">click</a>', {
      allowRemote: true,
    });
    expect(out).not.toMatch(/data:/i);
  });

  // Codex finding F34: SAFE_URI allowed root-relative "/..." and inbound only stripped
  // absolute http(s) img src. A hostile email with a root-relative image auto-fires an
  // app-origin GET (e.g. /auth/logout) when the body renders in the srcDoc iframe, a
  // CSRF-style same-origin request that survived the remote-content block.
  it("strips root-relative img src so no app-origin GET fires (allowRemote false)", () => {
    const out = sanitizeInboundHtml('<img src="/auth/logout">', { allowRemote: false });
    expect(out).not.toContain("/auth/logout");
  });

  it("strips root-relative img src even when remote content is opted in", () => {
    const out = sanitizeInboundHtml('<img src="/auth/logout">', { allowRemote: true });
    expect(out).not.toContain("/auth/logout");
  });

  it("strips root-relative href so a click cannot hit an app-origin route", () => {
    const out = sanitizeInboundHtml('<a href="/auth/logout">click</a>', { allowRemote: false });
    expect(out).not.toContain("/auth/logout");
  });

  it("strips ALL img src when remote content is blocked, not just http(s)", () => {
    const out = sanitizeInboundHtml('<img src="https://cdn.example/pixel.png" alt="x">', {
      allowRemote: false,
    });
    expect(out).not.toContain("cdn.example");
  });
});
