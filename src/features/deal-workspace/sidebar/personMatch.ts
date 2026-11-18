import { findSimilarOptions } from "@/features/entity-create/similarMatch";

export interface PersonMatchOption {
  id: string;
  name: string;
  emails: string[];
  phones: string[];
}

export interface PersonDraft {
  name: string;
  email: string;
  phone: string;
}

export type PersonMatchReason = "email" | "phone" | "name";

export interface PersonMatch {
  option: PersonMatchOption;
  reason: PersonMatchReason;
}

const MIN_PHONE_DIGITS = 7;

function digits(s: string): string {
  return s.replace(/\D+/g, "");
}

function byEmail(email: string, options: PersonMatchOption[]): PersonMatchOption[] {
  const q = email.trim().toLowerCase();
  if (!q.includes("@")) return [];
  return options.filter((o) => o.emails.some((e) => e.trim().toLowerCase() === q));
}

function byPhone(phone: string, options: PersonMatchOption[]): PersonMatchOption[] {
  const q = digits(phone);
  if (q.length < MIN_PHONE_DIGITS) return [];
  return options.filter((o) =>
    o.phones.some((p) => {
      const d = digits(p);
      return d.length >= MIN_PHONE_DIGITS && (d.endsWith(q) || q.endsWith(d));
    }),
  );
}

function byName(name: string, options: PersonMatchOption[]): PersonMatchOption[] {
  const q = name.trim();
  if (q === "") return [];
  const similar = new Set(findSimilarOptions(options, q).map((o) => o.id));
  return options.filter((o) => similar.has(o.id));
}

export function findPersonMatches(draft: PersonDraft, options: PersonMatchOption[]): PersonMatch[] {
  const matches = new Map<string, PersonMatch>();
  const bySignal: Array<[PersonMatchReason, PersonMatchOption[]]> = [
    ["email", byEmail(draft.email, options)],
    ["phone", byPhone(draft.phone, options)],
    ["name", byName(draft.name, options)],
  ];
  for (const [reason, found] of bySignal) {
    for (const option of found) {
      if (!matches.has(option.id)) matches.set(option.id, { option, reason });
    }
  }
  return [...matches.values()];
}
