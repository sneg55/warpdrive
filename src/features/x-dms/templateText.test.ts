import { describe, expect, it } from "vitest";
import { applyMergeFields } from "@/features/email/merge";
import { dmMergeContext, templateHtmlToDmText } from "./templateText";

describe("templateHtmlToDmText", () => {
  it("separates paragraphs with a blank line and keeps merge tokens", () => {
    expect(
      templateHtmlToDmText(
        '<p>Hi {{person.first_name}},</p><p>Apply here: <a href="https://example.com/apply">https://example.com/apply</a></p>',
      ),
    ).toBe("Hi {{person.first_name}},\n\nApply here: https://example.com/apply");
  });

  it("renders a link with different text as text (url)", () => {
    expect(templateHtmlToDmText('<p>See <a href="https://example.com/f">the form</a></p>')).toBe(
      "See the form (https://example.com/f)",
    );
  });

  it("treats a trailing slash and scheme as equal for link text", () => {
    expect(templateHtmlToDmText('<a href="https://example.com/x/">example.com/x</a>')).toBe(
      "https://example.com/x/",
    );
  });

  it("turns br into a single newline", () => {
    expect(templateHtmlToDmText("line one<br>line two")).toBe("line one\nline two");
  });

  it("decodes named and numeric entities", () => {
    expect(
      templateHtmlToDmText("<p>a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; &#x41;&nbsp;z</p>"),
    ).toBe("a & b <c> \"d\" 'e' A z");
  });

  it("does not double decode", () => {
    expect(templateHtmlToDmText("<p>&amp;lt;</p>")).toBe("&lt;");
  });

  it("prefixes list items and uses single newlines between them", () => {
    expect(templateHtmlToDmText("<ul><li>one</li><li>two</li></ul>")).toBe("- one\n- two");
  });

  it("drops other tags and collapses runs of newlines", () => {
    expect(
      templateHtmlToDmText("<p><strong>Hi</strong></p><p></p><p></p><p><em>there</em></p>"),
    ).toBe("Hi\n\nthere");
  });

  it("treats div as a single newline block", () => {
    expect(templateHtmlToDmText("<div>a</div><div>b</div>")).toBe("a\nb");
  });

  it("keeps a greater-than sign inside an attribute value", () => {
    expect(templateHtmlToDmText('<p><span title="a>b">x</span></p>')).toBe("x");
  });
});

describe("dmMergeContext", () => {
  it("splits first and last name", () => {
    const ctx = dmMergeContext("Ada Lovelace");
    expect(ctx["person.name"]).toBe("Ada Lovelace");
    expect(ctx["person.first_name"]).toBe("Ada");
    expect(ctx["person.last_name"]).toBe("Lovelace");
  });

  it("trims and splits on whitespace runs", () => {
    const ctx = dmMergeContext("  Ada   King  Lovelace ");
    expect(ctx["person.name"]).toBe("Ada King Lovelace");
    expect(ctx["person.first_name"]).toBe("Ada");
    expect(ctx["person.last_name"]).toBe("King Lovelace");
  });

  it("leaves last name empty for a single word", () => {
    expect(dmMergeContext("Ada")["person.last_name"]).toBe("");
  });

  it("resolves unrelated tokens to empty", () => {
    expect(applyMergeFields("x{{deal.title}}y", dmMergeContext("Ada Lovelace"))).toBe("xy");
  });
});
