export type PlanContactPoint = { label: string; value: string; primary?: boolean };

export function foldEmail(value: string): string {
  return value.trim().toLowerCase();
}

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

function demoteExistingPrimary(emails: PlanContactPoint[]): void {
  for (const [index, point] of emails.entries()) {
    if (point.primary === true) emails[index] = { ...point, primary: false };
  }
}

interface EmailAddResult {
  added: boolean;
  promoted: boolean;
}

function addEmail(emails: PlanContactPoint[], raw: string, makePrimary: boolean): EmailAddResult {
  const value = raw.trim();
  const known = emails.some((e) => foldEmail(e.value) === foldEmail(value));
  if (known || value.length === 0) return { added: false, promoted: false };
  if (makePrimary) demoteExistingPrimary(emails);
  emails.push({ label: "work", value, primary: makePrimary || emails.length === 0 });
  return { added: true, promoted: makePrimary };
}

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
