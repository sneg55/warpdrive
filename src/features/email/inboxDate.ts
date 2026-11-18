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
