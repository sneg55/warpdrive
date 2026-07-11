import type { CustomFieldTarget } from "./customFieldTypes";

// The standard (built-in) fields each entity ships with, shown in Settings > Data fields alongside
// custom fields. Built-in fields are NOT rows in custom_field_defs; this catalog is their source of
// truth. `key` matches the import field name (src/features/import/importFields.ts) where an import
// field exists, so ONE key gates every consumer (settings, import picker, forms, detail views).
// UI-only fields (owner, label, related org/person) have no import field; that is fine, they simply
// never match an import option. `locked` fields are the identity / find-or-create key and cannot be
// hidden.
export interface BuiltinField {
  key: string;
  label: string;
  locked: boolean;
}

const L = (key: string, label: string): BuiltinField => ({ key, label, locked: true });
const F = (key: string, label: string): BuiltinField => ({ key, label, locked: false });

export const BUILTIN_FIELDS: Record<CustomFieldTarget, readonly BuiltinField[]> = {
  organization: [
    L("name", "Name"),
    F("domain", "Website / domain"),
    F("industry", "Industry"),
    F("employeeCount", "Employee count"),
    F("annualRevenue", "Annual revenue"),
    F("linkedinUrl", "LinkedIn URL"),
    F("address", "Address"),
    F("owner", "Owner"),
    F("label", "Label"),
  ],
  person: [
    L("name", "Name"),
    F("emails", "Email"),
    F("phones", "Phone"),
    F("org", "Organization"),
    F("owner", "Owner"),
    F("label", "Label"),
  ],
  deal: [
    L("title", "Title"),
    F("value", "Value"),
    F("expectedCloseDate", "Expected close date"),
    F("pipeline", "Pipeline"),
    F("stage", "Stage"),
    F("org", "Organization"),
    F("person", "Person"),
    F("owner", "Owner"),
    F("label", "Label"),
  ],
  activity: [
    L("subject", "Subject"),
    F("typeKey", "Type"),
    F("dueAt", "Due date"),
    F("durationMinutes", "Duration"),
  ],
};

function fieldFor(entity: CustomFieldTarget, key: string): BuiltinField | undefined {
  return BUILTIN_FIELDS[entity].find((f) => f.key === key);
}

export function isBuiltinFieldKey(entity: CustomFieldTarget, key: string): boolean {
  return fieldFor(entity, key) !== undefined;
}

export function isBuiltinLocked(entity: CustomFieldTarget, key: string): boolean {
  return fieldFor(entity, key)?.locked === true;
}

// Is a given import field (by its import field name) hidden? True when its key is hidden directly,
// or when it is an address leaf and "address" is hidden (import splits the one "address" built-in
// into dotted leaves). Entity-agnostic: only organization has address.* import leaves, so the
// address-root check is unambiguous across entities. UI gating uses plain `hidden.has(key)`.
export function isImportFieldHidden(importFieldKey: string, hidden: ReadonlySet<string>): boolean {
  if (hidden.has(importFieldKey)) return true;
  if (importFieldKey.startsWith("address.") && hidden.has("address")) return true;
  return false;
}
