// Neutralize spreadsheet formula injection: prefix a cell that a spreadsheet would treat as a
// formula lead (= + - @, or a tab/CR) with an apostrophe so it renders as literal text.
export function neutralizeFormula(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

// Escape a field per RFC 4180: wrap in quotes when it contains a comma, quote, or newline.
export function escapeCsv(v: string): string {
  const safe = neutralizeFormula(v);
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
