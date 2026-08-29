import type { ProposedField } from "./types";

export function remainingFields(
  fields: ProposedField[],
  applied: string[],
  unresolved: string[],
): ProposedField[] {
  const gone = new Set([...applied, ...unresolved]);
  return fields.filter((f) => !gone.has(f.canonicalKey));
}
