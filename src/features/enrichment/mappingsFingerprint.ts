import type { ResolvedMapping } from "./types";

// Escaped so a value holding a delimiter cannot close its own segment and impersonate a different
// mapping set by shifting everything after it.
function quoted(value: string | null): string {
  return value === null ? "" : value.replaceAll("\\", "\\\\").replaceAll("|", "\\|");
}

// The targets a preview was computed against. An admin repointing a canonical key does not touch
// the record, so `updatedAt` still matches and the compare-and-swap alone would let a row the user
// reviewed as a gap overwrite a populated field somewhere else. Sorted, so the fingerprint does not
// depend on the order the rows came back in. The label is presentation and is excluded.
export function mappingsFingerprint(mappings: readonly ResolvedMapping[]): string {
  return mappings
    .map((m) =>
      [quoted(m.canonicalKey), m.targetKind, quoted(m.targetKey), quoted(m.targetFieldDefId)].join(
        "=",
      ),
    )
    .sort()
    .join("|");
}
