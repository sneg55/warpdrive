import { z } from "zod";
import { MAX_EMAIL_LEN } from "@/features/contacts/schemas";

const EMAIL = z.string().trim().min(1).max(MAX_EMAIL_LEN).email();

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
  if (text.length === 0) return false;
  return !rule(text);
}

export function isUsableProposedValue(canonicalKey: string, value: string | number): boolean {
  const rule = RULES[canonicalKey];
  if (rule === undefined) return true;
  return rule(String(value).trim());
}
