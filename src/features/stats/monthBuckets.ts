export const MAX_TREND_MONTHS = 60;

function monthIndex(month: string): number {
  return Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1);
}

function fromIndex(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export function monthsInRange(from: string, to: string, max = MAX_TREND_MONTHS): string[] {
  const start = monthIndex(from);
  const end = monthIndex(to);
  if (end < start) return [];
  const first = Math.max(start, end - max + 1);
  const out: string[] = [];
  for (let i = first; i <= end; i++) out.push(fromIndex(i));
  return out;
}

export function windowStart(from: string, months: string[]): string | null {
  const first = months[0];
  if (first === undefined) return null;
  const firstDay = `${first}-01`;
  return firstDay > from ? firstDay : from;
}
