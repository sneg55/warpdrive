import { describe, expect, it } from "vitest";
import {
  BUILTIN_FIELDS,
  isBuiltinFieldKey,
  isBuiltinLocked,
  isImportFieldHidden,
} from "./builtinFields";
import { CUSTOM_FIELD_TARGETS } from "./customFieldTypes";

describe("BUILTIN_FIELDS catalog", () => {
  it("defines fields for every entity with unique keys", () => {
    for (const entity of CUSTOM_FIELD_TARGETS) {
      const fields = BUILTIN_FIELDS[entity];
      expect(fields.length).toBeGreaterThan(0);
      const keys = fields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("locks exactly the identity field per entity", () => {
    expect(BUILTIN_FIELDS.organization.find((f) => f.key === "name")?.locked).toBe(true);
    expect(BUILTIN_FIELDS.person.find((f) => f.key === "name")?.locked).toBe(true);
    expect(BUILTIN_FIELDS.deal.find((f) => f.key === "title")?.locked).toBe(true);
    expect(BUILTIN_FIELDS.activity.find((f) => f.key === "subject")?.locked).toBe(true);
  });

  it("marks every other field unlocked", () => {
    for (const entity of CUSTOM_FIELD_TARGETS) {
      const locked = BUILTIN_FIELDS[entity].filter((f) => f.locked);
      expect(locked.length).toBe(1);
    }
  });

  it("recognises catalog keys and lock state", () => {
    expect(isBuiltinFieldKey("organization", "industry")).toBe(true);
    expect(isBuiltinFieldKey("organization", "nope")).toBe(false);
    expect(isBuiltinLocked("organization", "name")).toBe(true);
    expect(isBuiltinLocked("organization", "industry")).toBe(false);
    // An unknown key is not "locked" (it is simply not a built-in).
    expect(isBuiltinLocked("organization", "nope")).toBe(false);
  });

  it("gates address import leaves together when 'address' is hidden", () => {
    const hidden = new Set(["address"]);
    expect(isImportFieldHidden("address.city", hidden)).toBe(true);
    expect(isImportFieldHidden("address.postal", hidden)).toBe(true);
    expect(isImportFieldHidden("industry", hidden)).toBe(false);
    expect(isImportFieldHidden("name", hidden)).toBe(false);
  });

  it("gates a plain import field by exact key", () => {
    const hidden = new Set(["industry"]);
    expect(isImportFieldHidden("industry", hidden)).toBe(true);
    expect(isImportFieldHidden("domain", hidden)).toBe(false);
  });
});
