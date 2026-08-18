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

// Timeline card date, formatted like Pipedrive's deal history ("5:04 PM (a minute ago)"): the
// time of day, then an age that stays useful at every scale. `now` is injectable for testing.
export function formatTimelineEmailDate(iso: string | null, now: Date = new Date()): string {
  if (iso === null || iso === "") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const mins = Math.max(0, Math.round((now.getTime() - d.getTime()) / 60_000));
  if (mins < 1) return `${time} (just now)`;
  if (mins === 1) return `${time} (a minute ago)`;
  if (mins < 60) return `${time} (${mins} minutes ago)`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${time} (${hours} ${hours === 1 ? "hour" : "hours"} ago)`;
  const days = Math.round(hours / 24);
  return `${time} (${days} ${days === 1 ? "day" : "days"} ago)`;
}
