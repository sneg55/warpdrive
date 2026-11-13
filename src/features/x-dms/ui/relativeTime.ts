const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? "" : "s"} ago`;

export function formatXRelativeTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return "";
  const minutes = Math.max(0, Math.floor((now.getTime() - at) / MS_PER_MINUTE));
  if (minutes < 1) return "just now";
  if (minutes === 1) return "a minute ago";
  if (minutes < MINUTES_PER_HOUR) return plural(minutes, "minute");
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) return plural(hours, "hour");
  return plural(Math.floor(hours / HOURS_PER_DAY), "day");
}
