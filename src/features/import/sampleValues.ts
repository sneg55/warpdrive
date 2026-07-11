// How many example values sit under each CSV column name on the map step. Two is what Pipedrive
// shows (docs/parity-captures/leads-import-pd/08-map-step.png): enough to tell "state" apart from
// "city" at a glance, few enough that the row height stays stable.
export const MAP_SAMPLE_VALUE_COUNT = 2;

// Pull example values for one CSV column out of the batch's stored preview rows, so the mapper can
// see what a column actually contains before choosing a field for it. Values are shown verbatim
// (duplicates included, like PD) because collapsing them would misrepresent the file; blanks are
// skipped so a column with an empty leading row still shows real data.
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
