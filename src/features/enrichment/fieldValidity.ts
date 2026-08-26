// Whether the value a record already holds is broken rather than merely present. The merge uses
// it to pick a row's default: an occupied field normally starts unchecked so enrichment cannot
// quietly destroy real data, but a field holding a value that cannot be right has nothing worth
// protecting, so its replacement starts checked instead.

import { z } from "zod";
import { MAX_EMAIL_LEN } from "@/features/contacts/schemas";

// The same bound emailPointSchema applies, so a value cannot pass the preview and then fail the
// write, and a custom-mapped target that never sees emailPointSchema gets the same rule.
const EMAIL = z.string().trim().min(1).max(MAX_EMAIL_LEN).email();

// Canonical keys with a rule. A key absent from here has no notion of a malformed value, so its
// stored value is taken at face value.
const RULES: Readonly<Record<string, (value: string) => boolean>> = {
  "person.email": (value) => EMAIL.safeParse(value).success,
};

export function isInvalidCurrentValue(
  canonicalKey: string,
  value: string | number | null,
): boolean {
  const rule = RULES[canonicalKey];
  if (rule === undefined || value === null) return false;
  const text = String(value).trim();
  // An empty field is a gap, which the merge already handles as a fill.
  if (text.length === 0) return false;
  return !rule(text);
}

// The same rule turned on what a provider offers. A key can be mapped to a scalar custom field,
// and that route reaches the write through custom-field validation, which knows nothing about
// addresses. Refusing the value here is the only place it is caught for every target kind.
export function isUsableProposedValue(canonicalKey: string, value: string | number): boolean {
  const rule = RULES[canonicalKey];
  if (rule === undefined) return true;
  return rule(String(value).trim());
}
