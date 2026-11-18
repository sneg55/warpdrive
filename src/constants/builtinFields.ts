import type { CustomFieldTarget } from "./customFieldTypes";

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
    F("firstName", "First name"),
    F("lastName", "Last name"),
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
  lead: [
    L("title", "Title"),
    F("value", "Value"),
    F("expectedCloseDate", "Expected close date"),
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

export function isImportFieldHidden(importFieldKey: string, hidden: ReadonlySet<string>): boolean {
  if (hidden.has(importFieldKey)) return true;
  if (importFieldKey.startsWith("address.") && hidden.has("address")) return true;
  return false;
}
