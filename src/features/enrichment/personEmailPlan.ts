// Where a person selection lands. Split out of plan.ts because the email rules are the fiddly
// part: persons.primary_email is a column that updatePerson re-derives from the emails array, so
// both keeping an existing primary and promoting a new one are expressed by what the array says,
// never by patching the column.

// plan.ts's local shape: primary is optional here because rows written before the flag existed
// omit it, and re-adding it as false would rewrite points enrichment never touched.
export type PlanContactPoint = { label: string; value: string; primary?: boolean };

// The one comparison form for an address across the plan and the pre-write guard. They have to
// agree: if the guard folds two spellings together and the plan does not, an address the run
// itself supplied is appended and then read as one the record already held, which exempts it from
// the address rule.
export function foldEmail(value: string): string {
  return value.trim().toLowerCase();
}

// An address held only in the column has to travel with the patch, or updatePerson re-derives the
// primary from an array that does not contain it and the enriched address takes its place.
export function withStandalonePrimary(
  emails: readonly PlanContactPoint[],
  primaryEmail: string | null | undefined,
): PlanContactPoint[] {
  const value = primaryEmail === null || primaryEmail === undefined ? "" : primaryEmail.trim();
  if (value.length === 0) return [...emails];
  if (emails.some((e) => foldEmail(e.value) === foldEmail(value))) return [...emails];
  const flagged = emails.some((e) => e.primary === true);
  return [{ label: "work", value, primary: !flagged }, ...emails];
}

// Entries are replaced rather than mutated: withStandalonePrimary copies the array but not the
// points inside it, which the caller still holds. Only a flagged entry is rewritten, so one that
// never carried the key does not gain a `primary: false` it did not have.
function demoteExistingPrimary(emails: PlanContactPoint[]): void {
  for (const [index, point] of emails.entries()) {
    if (point.primary === true) emails[index] = { ...point, primary: false };
  }
}

interface EmailAddResult {
  added: boolean;
  // A promotion displaces the address the record answered to, so it is a replacement rather than
  // an append, and the change log has to show what it displaced.
  promoted: boolean;
}

// Adds an address the record lacks. Nothing is ever removed: promoting demotes the previous
// primary and leaves it on the record, so a wrong promotion stays recoverable.
function addEmail(emails: PlanContactPoint[], raw: string, makePrimary: boolean): EmailAddResult {
  const value = raw.trim();
  const known = emails.some((e) => foldEmail(e.value) === foldEmail(value));
  if (known || value.length === 0) return { added: false, promoted: false };
  if (makePrimary) demoteExistingPrimary(emails);
  emails.push({ label: "work", value, primary: makePrimary || emails.length === 0 });
  return { added: true, promoted: makePrimary };
}

// What planPersonUpdate's loop builds up. Held together so the built-in branch can be its own
// function rather than another arm of an already long loop.
export interface PersonAccumulator {
  patch: Record<string, unknown>;
  emails: PlanContactPoint[];
  appliedFields: string[];
  appliedValues: Record<string, string | number>;
  appendedFields: string[];
  emailsTouched: boolean;
  orgCandidateName?: string;
}

export function applyBuiltinSelection(
  acc: PersonAccumulator,
  mapping: { canonicalKey: string; targetKey: string | null },
  selection: { value: string | number; makePrimary?: boolean },
): void {
  switch (mapping.targetKey ?? "") {
    case "emails": {
      const value = String(selection.value).trim();
      const { added, promoted } = addEmail(acc.emails, value, selection.makePrimary === true);
      if (!added) return;
      acc.emailsTouched = true;
      acc.appliedFields.push(mapping.canonicalKey);
      acc.appliedValues[mapping.canonicalKey] = value;
      // A promotion displaces the previous primary, so the change log records what it replaced.
      if (!promoted) acc.appendedFields.push(mapping.canonicalKey);
      return;
    }
    case "org":
      acc.orgCandidateName = String(selection.value).trim();
      acc.appliedFields.push(mapping.canonicalKey);
      return;
    default: {
      const text = String(selection.value);
      acc.patch[mapping.targetKey ?? ""] = text;
      acc.appliedFields.push(mapping.canonicalKey);
      acc.appliedValues[mapping.canonicalKey] = text;
    }
  }
}
