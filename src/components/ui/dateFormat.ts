// Pure date-string helpers for the shared DatePicker. Value contract is local
// YYYY-MM-DD (matches the existing action inputs z.string().date() and the
// composer startDate state), display is MM/DD/YYYY (Pipedrive parity).

export function toYmd(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseYmd(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m === null) return null;
  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  // new Date(y, m, d) silently rolls invalid parts into the next
  // month/year (e.g. Feb 30 -> Mar 2); round-trip the parts to reject
  // out-of-range calendar values instead of accepting a rolled-over date.
  const isSameCalendarDate =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return isSameCalendarDate ? date : null;
}

export function formatMdy(v: string): string {
  const d = parseYmd(v);
  if (d === null) return "";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}
