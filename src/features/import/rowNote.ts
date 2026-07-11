import type { ResolvedColumnMapping } from "./schemas";

// A cell counts as present only when it holds something after trimming: a blank cell in the note
// would render as a dangling "key: " line.
function hasValue(cell: string | undefined): cell is string {
  return cell !== undefined && cell.trim() !== "";
}

// Headers whose cell holds a value but whose column goes nowhere: either absent from the mapping
// or explicitly set to "do not import". Pipedrive discards these outright; capturing them in a
// note is the whole point of the row-note checkbox.
//
// `order` fixes the line order. In the storage-backed flow `raw` is loaded from a JSONB column and
// Postgres does not preserve CSV key order, so the batch's stored `headers` are passed in to keep
// the note reading in the columns' original order. Without it, fall back to the raw key order.
export function unmappedHeaders(
  raw: Record<string, string>,
  mapping: ResolvedColumnMapping,
  order?: readonly string[],
): string[] {
  const headers = order ?? Object.keys(raw);
  return headers.filter((header) => {
    if (!hasValue(raw[header])) return false;
    const choice = mapping.columns[header];
    if (choice === undefined) return true;
    return choice.field === "" && choice.key === "";
  });
}

// The body of the single note a row produces: the cell mapped to Note > body, then a blank line,
// then "key: value" for each unmapped column (only when the checkbox is on). Returns null when
// there is nothing worth writing, so commit creates no empty note.
export function buildRowNoteBody(
  raw: Record<string, string>,
  mapping: ResolvedColumnMapping,
  mappedBody: string | null,
  order?: readonly string[],
): string | null {
  const blocks: string[] = [];
  if (hasValue(mappedBody ?? undefined)) blocks.push((mappedBody as string).trim());

  if (mapping.options.rowNoteFromUnmapped) {
    const lines = unmappedHeaders(raw, mapping, order).map(
      (header) => `${header}: ${(raw[header] as string).trim()}`,
    );
    if (lines.length > 0) blocks.push(lines.join("\n"));
  }

  return blocks.length === 0 ? null : blocks.join("\n\n");
}
