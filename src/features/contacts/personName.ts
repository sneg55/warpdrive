// Pure name split/join for persons. Pipedrive treats first/last as the source and
// derives the display name; we keep a single `name` column as the derived value so
// search/dedup/display keep reading one field. splitName is the inverse used to backfill
// and to seed first/last from create flows that still pass a combined name.
export function splitName(name: string): { firstName: string; lastName: string | null } {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p !== "");
  if (parts.length === 0) return { firstName: "", lastName: null };
  const [firstName = "", ...rest] = parts;
  return { firstName, lastName: rest.length > 0 ? rest.join(" ") : null };
}

export function joinName(parts: { firstName: string; lastName?: string | null }): string {
  return [parts.firstName.trim(), (parts.lastName ?? "").trim()].filter((p) => p !== "").join(" ");
}

interface ResolvedPersonName {
  firstName: string | null;
  lastName: string | null;
  name: string;
}

// Resolve the firstName/lastName/name triad for a person update. Pipedrive treats first/last
// as the source of truth: editing either recomputes the combined `name` (search/dedup/display
// keep reading that one field). A plain `{ name: "..." }` edit (EditContactModal /
// PersonSummaryEditPanel's Name row) is the inverse, a direct write to the combined name, so
// first/last are re-derived from it via splitName rather than kept as-is, otherwise they go
// stale relative to the new name (the data-loss bug this guards against: a post-migration
// person with NULL first/last, later patched with only lastName, would recompute `name` from
// an empty firstName and overwrite the whole thing). Neither present: nothing name-related
// changes.
export function resolvePersonName(
  input: { firstName?: string | null; lastName?: string | null; name?: string },
  current: { firstName: string | null; lastName: string | null; name: string },
): ResolvedPersonName {
  const editingName = input.firstName !== undefined || input.lastName !== undefined;
  if (editingName) {
    const firstName = input.firstName === undefined ? current.firstName : input.firstName;
    const lastName = input.lastName === undefined ? current.lastName : input.lastName;
    return { firstName, lastName, name: joinName({ firstName: firstName ?? "", lastName }) };
  }
  if (input.name !== undefined) {
    const split = splitName(input.name);
    return { firstName: split.firstName, lastName: split.lastName, name: input.name };
  }
  return { firstName: current.firstName, lastName: current.lastName, name: current.name };
}
