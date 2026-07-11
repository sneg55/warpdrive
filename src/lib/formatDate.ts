// Readable date for a YYYY-MM-DD string: "Jul 16, 2026" (PD shows a readable date, not MM/DD/YYYY).
// Parsed as a local date (not UTC) so the day never shifts by a timezone off-by-one.
export function formatMediumDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return ymd;
  return new Date(y as number, (m as number) - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
