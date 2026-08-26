// Month series for the won-deal trend, derived from the requested range rather than from the
// rows the query returns: a month with no won deals must render a zero, not a gap.
// String arithmetic on YYYY-MM, so no Date object can shift a bucket across a timezone.

// A decade-wide range draws ticks nothing can read. Five years is the longest series the chart
// renders; beyond that the oldest months are dropped and the SQL window follows (windowStart).
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

// The date the SQL window should open on so it covers exactly the rendered months.
export function windowStart(from: string, months: string[]): string | null {
  const first = months[0];
  if (first === undefined) return null;
  const firstDay = `${first}-01`;
  return firstDay > from ? firstDay : from;
}
