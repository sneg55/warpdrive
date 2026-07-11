import type { ContactPoint } from "@/types/contactPoint";

export function derivePrimaryEmail(emails: ContactPoint[]): string | null {
  if (emails.length === 0) return null;
  const chosen = emails.find((e) => e.primary) ?? emails[0];
  if (chosen === undefined) return null;
  return chosen.value.trim().toLowerCase();
}
