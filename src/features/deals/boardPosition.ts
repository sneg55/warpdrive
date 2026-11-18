export function midpoint(before: string | null, after: string | null): string {
  if (before === null && after === null) return "1";
  if (after === null) return String(Number(before) + 1);
  if (before === null) return String(Number(after) / 2);
  const mid = (Number(before) + Number(after)) / 2;
  return String(mid);
}
