import { describe, expect, it } from "vitest";
import { sendEmailInput } from "./sendInput";

describe("sendEmailInput schema recipient validation", () => {
  const base = {
    accountId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    subject: "hi",
    bodyHtml: "<p>hi</p>",
  };

  it("rejects a malformed recipient address", () => {
    expect(sendEmailInput.safeParse({ ...base, to: ["not-an-email"] }).success).toBe(false);
  });

  it("rejects a malformed cc address", () => {
    expect(sendEmailInput.safeParse({ ...base, to: ["a@b.com"], cc: ["bad"] }).success).toBe(false);
  });

  it("accepts valid recipient addresses", () => {
    expect(sendEmailInput.safeParse({ ...base, to: ["a@b.com"] }).success).toBe(true);
  });
});
