export interface ContactPoint {
  label: string;
  value: string;
  primary?: boolean;
}

export function nonEmptyPoints(
  rows: ContactPoint[],
): Array<{ label: string; value: string; primary: boolean }> {
  return rows
    .filter((r) => r.value.trim() !== "")
    .map((r) => ({ label: r.label, value: r.value.trim(), primary: r.primary === true }));
}

export function cleanAddress(a: Record<string, string>): Record<string, string> | null {
  const entries = Object.entries(a).filter(([, v]) => v.trim() !== "");
  return entries.length === 0 ? null : Object.fromEntries(entries);
}
