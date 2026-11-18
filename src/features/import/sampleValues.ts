export const MAP_SAMPLE_VALUE_COUNT = 2;

export function sampleValues(
  previewRows: Record<string, string>[],
  header: string,
  limit: number = MAP_SAMPLE_VALUE_COUNT,
): string[] {
  const out: string[] = [];
  for (const row of previewRows) {
    if (out.length >= limit) break;
    const value = row[header]?.trim() ?? "";
    if (value !== "") out.push(value);
  }
  return out;
}
