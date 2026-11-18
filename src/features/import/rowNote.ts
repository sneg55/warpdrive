import type { ResolvedColumnMapping } from "./schemas";

function hasValue(cell: string | undefined): cell is string {
  return cell !== undefined && cell.trim() !== "";
}

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
