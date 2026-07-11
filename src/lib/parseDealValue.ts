/**
 * Parse a deal's stored value (a Postgres numeric column, delivered as a decimal string or null)
 * into a number, or null when the value is unset (null / blank) or not numeric. One source of
 * truth so board sorting, filtering, and any numeric compare agree on a deal's amount.
 * Note: this is a value parser, not a formatter; see formatCurrency for display.
 */
export function parseDealValue(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}
