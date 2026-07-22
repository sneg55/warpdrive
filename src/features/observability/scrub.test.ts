import { describe, expect, it } from "vitest";
import { sanitizeErrorEmails, scrubEvent, scrubProperties } from "./scrub";

describe("scrubProperties", () => {
  it("redacts PII-looking keys and keeps safe + posthog keys", () => {
    const out = scrubProperties({
      email: "a@b.com",
      contactName: "Jane",
      body: "hi",
      errorId: "E_PERM_DENIED",
      route: "/pipeline/1",
      $current_url: "http://x",
    });
    expect(out.email).toBe("[redacted]");
    expect(out.contactName).toBe("[redacted]");
    expect(out.body).toBe("[redacted]");
    expect(out.errorId).toBe("E_PERM_DENIED");
    expect(out.route).toBe("/pipeline/1");
    expect(out.$current_url).toBe("http://x");
  });

  it("redacts email addresses from message values", () => {
    expect(scrubProperties({ message: "failed for jane@acme.com" }).message).toBe(
      "failed for [email]",
    );
  });
});

describe("sanitizeErrorEmails", () => {
  it("redacts emails from an Error message and stack", () => {
    const out = sanitizeErrorEmails(new Error("failed for jane@acme.com"));
    expect(out).toBeInstanceOf(Error);
    expect((out as Error).message).toBe("failed for [email]");
  });

  it("redacts emails from a bare string", () => {
    expect(sanitizeErrorEmails("bob@x.io broke")).toBe("[email] broke");
  });

  it("passes non-error, non-string values through untouched (same reference)", () => {
    const obj = { cause: "x" };
    expect(sanitizeErrorEmails(obj)).toBe(obj);
  });
});

describe("scrubEvent", () => {
  it("passes null through and scrubs event.properties", () => {
    expect(scrubEvent(null)).toBeNull();
    const ev = { properties: { email: "a@b.com", route: "/x" } };
    const out = scrubEvent(ev);
    expect(out?.properties?.email).toBe("[redacted]");
    expect(out?.properties?.route).toBe("/x");
  });
});
