import { findSimilarOptions } from "@/features/entity-create/similarMatch";

// A visible person reduced to the fields the deal Person panel can match a typed draft against.
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

// Which typed field pointed at this person. Ordered strongest first: an email is an identity, a
// phone very nearly one, a name only a hint.
export type PersonMatchReason = "email" | "phone" | "name";

export interface PersonMatch {
  option: PersonMatchOption;
  reason: PersonMatchReason;
}

// Phone numbers are stored however they were typed ("+1 (619) 555-0134"), so compare digits only.
// Below this many digits the input is an extension or a fragment, and would collide with unrelated
// numbers that happen to share a tail.
const MIN_PHONE_DIGITS = 7;

function digits(s: string): string {
  return s.replace(/\D+/g, "");
}

// Only a complete address is an identity claim; "steve" is still mid-typing.
function byEmail(email: string, options: PersonMatchOption[]): PersonMatchOption[] {
  const q = email.trim().toLowerCase();
  if (!q.includes("@")) return [];
  return options.filter((o) => o.emails.some((e) => e.trim().toLowerCase() === q));
}

// Compared on the shared tail rather than for equality, so a stored "+1 (619) 555-0134" still
// matches a typed "619-555-0134": the same line is routinely written with and without its country
// code. Both sides must clear the digit floor, so a short fragment cannot swallow a long number.
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

// Reuses the Add deal/lead near-duplicate scan so the panel warns on the same spellings the create
// comboboxes already do.
function byName(name: string, options: PersonMatchOption[]): PersonMatchOption[] {
  const q = name.trim();
  if (q === "") return [];
  const similar = new Set(findSimilarOptions(options, q).map((o) => o.id));
  return options.filter((o) => similar.has(o.id));
}

// Existing people that the half-typed draft looks like, so the panel can offer to link one instead
// of creating a duplicate. Each person appears at most once, under its strongest signal.
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
