import { escapeCsv } from "./csvSafe";

export interface ErrorReportRow {
  rowNumber: number;
  raw: Record<string, string>;
  errors: { field: string; message: string }[];
}

// Columns: row number, flattened errors, then every raw header seen in first-seen order.
export function buildErrorCsv(rows: ErrorReportRow[]): string {
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r.raw)) {
      if (!seen.has(k)) {
        seen.add(k);
        headers.push(k);
      }
    }
  }
  const head = ["row", "errors", ...headers].map(escapeCsv).join(",");
  const lines = rows.map((r) => {
    const reasons = r.errors.map((e) => `${e.field}: ${e.message}`).join("; ");
    const cells = [String(r.rowNumber), reasons, ...headers.map((h) => r.raw[h] ?? "")];
    return cells.map(escapeCsv).join(",");
  });
  return [head, ...lines].join("\n");
}
