import { describe, expect, it } from "vitest";
import { DEFAULT_BUILTIN_MAPPINGS } from "./canonical";
import { WRITABLE_BUILTIN_TARGETS } from "./mappingsRepo";

describe("WRITABLE_BUILTIN_TARGETS", () => {
  it("covers every default seeded mapping target", () => {
    for (const [canonicalKey, targetKey] of Object.entries(DEFAULT_BUILTIN_MAPPINGS)) {
      const entity = canonicalKey.startsWith("org.") ? "organization" : "person";
      expect(WRITABLE_BUILTIN_TARGETS[entity].has(targetKey)).toBe(true);
    }
  });

  it("offers the organization data fields plus the address leaves", () => {
    expect([...WRITABLE_BUILTIN_TARGETS.organization].sort()).toEqual([
      "address.city",
      "address.country",
      "address.postal",
      "address.region",
      "address.street",
      "annualRevenue",
      "domain",
      "employeeCount",
      "industry",
      "linkedinUrl",
      "name",
    ]);
  });

  it("offers only the person fields enrichment knows how to write", () => {
    expect([...WRITABLE_BUILTIN_TARGETS.person].sort()).toEqual([
      "emails",
      "firstName",
      "lastName",
      "name",
      "org",
    ]);
  });

  it("excludes owner and label on both entities", () => {
    for (const entity of ["organization", "person"] as const) {
      expect(WRITABLE_BUILTIN_TARGETS[entity].has("owner")).toBe(false);
      expect(WRITABLE_BUILTIN_TARGETS[entity].has("label")).toBe(false);
    }
  });
});
