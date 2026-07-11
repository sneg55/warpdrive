import { describe, expect, it } from "vitest";
import { isValidEmail } from "./isValidEmail";

// isValidEmail replaces a client-side `z.string().email()` check in the email composer's
// RecipientField, so zod no longer has to ship in the client bundle for one boolean. These
// cases pin the behavior we relied on: a well-formed address with a dotted domain passes;
// missing local part, missing/undotted domain, whitespace, and double @ all fail.
describe("isValidEmail", () => {
  it("accepts a plain address", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
  });

  it("accepts dots, plus tags, and a subdomain", () => {
    expect(isValidEmail("first.last+tag@sub.example.co")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidEmail("")).toBe(false);
  });

  it("rejects a bare word with no @", () => {
    expect(isValidEmail("notanemail")).toBe(false);
  });

  it("rejects a missing domain", () => {
    expect(isValidEmail("user@")).toBe(false);
  });

  it("rejects a missing local part", () => {
    expect(isValidEmail("@example.com")).toBe(false);
  });

  it("rejects a domain with no dot (no TLD)", () => {
    expect(isValidEmail("user@example")).toBe(false);
  });

  it("rejects an internal space", () => {
    expect(isValidEmail("user name@example.com")).toBe(false);
  });

  it("rejects a double @", () => {
    expect(isValidEmail("user@@example.com")).toBe(false);
  });
});
