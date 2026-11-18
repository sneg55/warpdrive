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
