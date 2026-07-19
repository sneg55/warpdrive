// Date formatters for the deal-list cells, tolerant of a Date or a serialized ISO string
// crossing the SSR boundary. Extracted from DealList to keep that component under the size cap.

// Short activity date, tolerant of a Date or a serialized string crossing the SSR boundary.
export function fmtDate(d: Date | string | null): string {
  if (d === null) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Expected close is a date-only column (YYYY-MM-DD). Parse the parts as a LOCAL date so a
// browser in a negative-UTC timezone does not render the previous day (new Date("2026-08-01")
// is parsed as UTC midnight, which would shift back a day west of Greenwich).
export function fmtDateOnly(d: string | null | undefined): string {
  if (d === null || d === undefined || d === "") return "";
  const parts = d.split("-");
  if (parts.length !== 3) return "";
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day)) return "";
  return new Date(y, m - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
