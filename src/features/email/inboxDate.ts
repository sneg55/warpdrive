// Inbox list date, formatted like Pipedrive's Sales Inbox: a short "MMM D" for the current year
// (e.g. "Jul 2") and "MMM D, YYYY" for older messages, instead of a verbose locale datetime
// ("7/1/2026, 10:14:50 AM"). `now` is injectable so the year boundary is testable.
export function formatInboxListDate(iso: string | null, now: Date = new Date()): string {
  if (iso === null || iso === "") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

// Reader message-header date, formatted like Pipedrive's thread view ("June 11 (29 days ago)"):
// full month + day, an omitted year for the current year, and a relative age, instead of a raw
// locale datetime with seconds ("7/11/2026, 12:14:47 AM"). `now` is injectable for testing.
export function formatReaderDate(iso: string | null, now: Date = new Date()): string {
  if (iso === null || iso === "") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === now.getFullYear();
  const datePart = d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const startOfDay = (x: Date): number =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  const rel = diffDays <= 0 ? "today" : diffDays === 1 ? "yesterday" : `${diffDays} days ago`;
  return `${datePart} (${rel})`;
}
