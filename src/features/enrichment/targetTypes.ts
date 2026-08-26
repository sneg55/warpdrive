// Which custom-field types can hold a scalar a provider emits, derived from valueSchemaFor in
// src/features/custom-fields/validate.ts: text/large_text/autocomplete are plain strings,
// numeric/monetary are plain numbers, and every other type needs a shape or a format a provider
// value cannot satisfy (option ids, uuids, date and time formats, address objects).
//
// This file pulls in no database code so both the settings UI and the repo can use it: the Select
// must offer exactly the targets a save would accept, and two copies of the rule would drift into a
// menu listing a field the save then refuses.
import { valueTypeOf } from "./canonical";
export const STRING_TARGET_TYPES: ReadonlySet<string> = new Set([
  "text",
  "large_text",
  "autocomplete",
]);

export const NUMBER_TARGET_TYPES: ReadonlySet<string> = new Set(["numeric", "monetary"]);

export function targetAcceptsType(
  fieldType: string,
  valueType: "string" | "number" | undefined,
): boolean {
  if (valueType === "number") return NUMBER_TARGET_TYPES.has(fieldType);
  if (valueType === "string") return STRING_TARGET_TYPES.has(fieldType);
  return false;
}

// Built-in columns are not interchangeable either: employee_count is an integer, emails is a
// contact-point array, org is a link. A description mapped onto employeeCount either fails the
// whole apply or, when the description happens to look numeric, overwrites the headcount.
const NUMERIC_BUILTINS: ReadonlySet<string> = new Set(["employeeCount", "annualRevenue"]);
const SPECIAL_BUILTINS: Readonly<Record<string, string>> = {
  emails: "person.email",
  org: "person.companyName",
};

export function builtinAcceptsCanonical(targetKey: string, canonicalKey: string): boolean {
  const only = SPECIAL_BUILTINS[targetKey];
  if (only !== undefined) return only === canonicalKey;
  return NUMERIC_BUILTINS.has(targetKey) === (valueTypeOf(canonicalKey) === "number");
}
