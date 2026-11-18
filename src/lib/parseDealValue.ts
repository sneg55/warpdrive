export function parseDealValue(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}
