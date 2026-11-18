export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

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

function splitRecords(text: string): string[][] {
  const st: ParseState = { records: [], record: [], field: "", inQuotes: false };
  let i = 0;
  while (i < text.length) {
    i += st.inQuotes ? stepQuoted(st, text, i) : stepUnquoted(st, text, i);
  }
  if (st.field !== "" || st.record.length > 0) endRecord(st);
  return st.records;
}

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
