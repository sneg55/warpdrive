import type { ResolvedMapping } from "./types";

function quoted(value: string | null): string {
  return value === null ? "" : value.replaceAll("\\", "\\\\").replaceAll("|", "\\|");
}

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
