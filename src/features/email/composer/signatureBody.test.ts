import { describe, expect, it } from "vitest";
import { swapSignatureInBody } from "./signatureBody";

describe("swapSignatureInBody (C3)", () => {
  const SIG_A = "<p>-- Jane</p>";
  const SIG_B = "<p>-- John</p>";

  it("appends the signature when none is embedded yet", () => {
    expect(swapSignatureInBody("<p>hi</p>", "", SIG_A)).toBe(`<p>hi</p>${SIG_A}`);
  });

  it("replaces the embedded signature at the tail with the next one (no accumulation)", () => {
    const body = `<p>hi</p>${SIG_A}`;
    expect(swapSignatureInBody(body, SIG_A, SIG_B)).toBe(`<p>hi</p>${SIG_B}`);
  });

  it("removes the block when the next signature is empty (None)", () => {
    const body = `<p>hi</p>${SIG_A}`;
    expect(swapSignatureInBody(body, SIG_A, "")).toBe("<p>hi</p>");
  });

  it("does not strip when the tail no longer matches (edited signature), only appends", () => {
    // The user edited the signature so the tail differs from `embedded`; the old text is left in
    // place. Send never double-appends regardless, since it passes no signatureId.
    const body = "<p>hi</p><p>-- Jane (edited)</p>";
    expect(swapSignatureInBody(body, SIG_A, SIG_B)).toBe(`${body}${SIG_B}`);
  });
});
