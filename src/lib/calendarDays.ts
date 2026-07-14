const DAY = 86_400_000;

// Whole calendar days from `from` to `to`, reckoned in the local timezone. Unlike flooring the raw
// millisecond delta, this counts date boundaries crossed, so a record created 7/10 in the afternoon
// is "2 days" old on 7/12 in the morning (not 1). Local parts keep it consistent with dates shown
// via toLocaleDateString(). Negative when `to` precedes `from`'s calendar day; callers clamp if the
// domain forbids negatives. Math.round absorbs the 23/25-hour DST days so the count stays whole.
export function calendarDaysBetween(from: Date, to: Date): number {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((end.getTime() - start.getTime()) / DAY);
}
