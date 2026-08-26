import { describe, expect, it } from "vitest";
import { BUILTIN_FIELDS } from "@/constants/builtinFields";
import { ENTITY_FIELDS } from "@/features/import/importFields";
import {
  CANONICAL_FIELDS,
  canonicalKeysFor,
  DEFAULT_BUILTIN_MAPPINGS,
  isCanonicalKey,
  valueTypeOf,
} from "./canonical";

describe("canonical vocabulary", () => {
  it("namespaces every key by its entity", () => {
    for (const field of CANONICAL_FIELDS) {
      expect(field.key.startsWith(`${field.entity === "organization" ? "org" : "person"}.`)).toBe(
        true,
      );
    }
  });

  it("has no duplicate keys", () => {
    const keys = CANONICAL_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("splits keys by entity", () => {
    expect(canonicalKeysFor("person")).toContain("person.title");
    expect(canonicalKeysFor("person")).not.toContain("org.industry");
    expect(canonicalKeysFor("organization")).toContain("org.industry");
    expect(canonicalKeysFor("organization")).not.toContain("person.title");
  });

  it("recognises known keys and rejects invented ones", () => {
    expect(isCanonicalKey("person.title")).toBe(true);
    expect(isCanonicalKey("person.favouriteColour")).toBe(false);
  });

  it("declares a value type per key", () => {
    expect(valueTypeOf("org.employeeCount")).toBe("number");
    expect(valueTypeOf("org.industry")).toBe("string");
  });
});

describe("default built-in mappings", () => {
  it("only targets built-in field keys that actually exist", () => {
    const entries: [string, string][] = Object.entries(DEFAULT_BUILTIN_MAPPINGS).flatMap(
      ([key, target]) => (typeof target === "string" ? [[key, target] as [string, string]] : []),
    );
    expect(entries.length).toBeGreaterThan(0);
    for (const [canonicalKey, target] of entries) {
      const entity = canonicalKey.startsWith("org.") ? "organization" : "person";
      const importFields = ENTITY_FIELDS[entity].map((f) => f.field);
      const builtinKeys = BUILTIN_FIELDS[entity].map((f) => f.key);
      // Address leaves live only in the import catalogue; everything else is a built-in field.
      const known = builtinKeys.includes(target) || importFields.includes(target);
      expect(known, `${canonicalKey} -> ${target}`).toBe(true);
    }
  });

  it("uses the import catalogue's address leaf names, not invented ones", () => {
    expect(DEFAULT_BUILTIN_MAPPINGS["org.state"]).toBe("address.region");
    expect(DEFAULT_BUILTIN_MAPPINGS["org.postalCode"]).toBe("address.postal");
  });

  it("default-maps each person name part onto its own column", () => {
    expect(DEFAULT_BUILTIN_MAPPINGS["person.firstName"]).toBe("firstName");
    expect(DEFAULT_BUILTIN_MAPPINGS["person.lastName"]).toBe("lastName");
  });

  it("maps only canonical keys", () => {
    for (const key of Object.keys(DEFAULT_BUILTIN_MAPPINGS)) {
      expect(isCanonicalKey(key), key).toBe(true);
    }
  });
});
