// RFC-4180-ish CSV parser. Client-side only: turns an uploaded file's text into
// headers + header-keyed row objects. Handles quoted fields, escaped double-quotes
// (""), embedded commas/newlines, and CRLF or LF endings. Import files are small
// enough to parse fully in memory (no streaming).
export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

// Mutable tokenizer state. Split out of the main loop so each step handler stays
// under the cognitive-complexity budget.
interface ParseState {
  records: string[][];
  record: string[];
  field: string;
  inQuotes: boolean;
}

function endField(st: ParseState): void {
  st.record.push(st.field);
  st.field = "";
}

function endRecord(st: ParseState): void {
  endField(st);
  st.records.push(st.record);
  st.record = [];
}

// Consume one character while inside a quoted field; return chars consumed.
function stepQuoted(st: ParseState, text: string, i: number): number {
  const ch = text[i];
  if (ch === '"') {
    if (text[i + 1] === '"') {
      st.field += '"';
      return 2;
    }
    st.inQuotes = false;
    return 1;
  }
  st.field += ch ?? "";
  return 1;
}

// Consume one character while outside quotes; return chars consumed.
function stepUnquoted(st: ParseState, text: string, i: number): number {
  const ch = text[i];
  if (ch === '"') {
    st.inQuotes = true;
    return 1;
  }
  if (ch === ",") {
    endField(st);
    return 1;
  }
  if (ch === "\r") {
    endRecord(st);
    return text[i + 1] === "\n" ? 2 : 1;
  }
  if (ch === "\n") {
    endRecord(st);
    return 1;
  }
  st.field += ch ?? "";
  return 1;
}

// Tokenize the whole text into an array of records, each a list of raw field values.
function splitRecords(text: string): string[][] {
  const st: ParseState = { records: [], record: [], field: "", inQuotes: false };
  let i = 0;
  while (i < text.length) {
    i += st.inQuotes ? stepQuoted(st, text, i) : stepUnquoted(st, text, i);
  }
  // Flush a trailing record only if the last line had content (no phantom blank row).
  if (st.field !== "" || st.record.length > 0) endRecord(st);
  return st.records;
}

// A record is "blank" when it is a single cell that is empty or whitespace-only (an empty
// physical line, or a space/tab-only line that spreadsheet exports often leave trailing).
function isBlank(record: string[]): boolean {
  return record.length === 1 && (record[0] ?? "").trim() === "";
}

export function parseCsv(text: string): ParsedCsv {
  const records = splitRecords(text).filter((r) => !isBlank(r));
  const [headerRow, ...dataRows] = records;
  if (headerRow === undefined) return { headers: [], rows: [] };
  const headers = headerRow.map((h) => h.trim());
  const rows = dataRows.map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, idx) => {
      obj[header] = (cells[idx] ?? "").trim();
    });
    return obj;
  });
  return { headers, rows };
}
