import { describe, expect, it } from "vitest";
import { buildObjectKey, sanitizeSlug, validateDisplayFilename } from "./keys";

describe("sanitizeSlug", () => {
  it("strips traversal and control chars from the slug", () => {
    expect(sanitizeSlug("../../etc/passwd\n")).toBe("etcpasswd");
  });

  it("lowercases, collapses whitespace to dashes, and keeps a single dot", () => {
    expect(sanitizeSlug("My Report.PDF")).toBe("my-report.pdf");
  });
});

describe("buildObjectKey", () => {
  it("builds a key from server values only", () => {
    expect(
      buildObjectKey({
        entityType: "deal",
        entityId: "d1",
        fileId: "f1",
        filename: "My Report.PDF",
      }),
    ).toBe("deal/d1/f1-my-report.pdf");
  });
});

describe("validateDisplayFilename", () => {
  it("rejects a display filename with a path separator", () => {
    const r = validateDisplayFilename("a/b.pdf");
    expect(r.ok).toBe(false);
  });

  it("rejects a display filename with CRLF (header injection)", () => {
    const r = validateDisplayFilename("a\r\nContent-Type: x");
    expect(r.ok).toBe(false);
  });

  it("rejects an over-length display filename", () => {
    const r = validateDisplayFilename(`${"a".repeat(256)}.pdf`);
    expect(r.ok).toBe(false);
  });

  it("accepts and NFC-normalizes a normal name", () => {
    const r = validateDisplayFilename("quote.pdf");
    expect(r).toEqual({ ok: true, value: "quote.pdf" });
  });
});
