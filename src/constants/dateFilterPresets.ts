export const DATE_PRESET_KEYS = [
  "today",
  "yesterday",
  "tomorrow",
  "this_week",
  "last_week",
  "next_week",
  "this_month",
  "last_month",
  "next_month",
  "last_7_days",
  "next_7_days",
  "last_30_days",
  "next_30_days",
] as const;
export type DatePresetKey = (typeof DATE_PRESET_KEYS)[number];

export const DATE_PRESET_LABELS: Record<DatePresetKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  tomorrow: "Tomorrow",
  this_week: "This week",
  last_week: "Last week",
  next_week: "Next week",
  this_month: "This month",
  last_month: "Last month",
  next_month: "Next month",
  last_7_days: "Last 7 days",
  next_7_days: "Next 7 days",
  last_30_days: "Last 30 days",
  next_30_days: "Next 30 days",
};

export function isDatePreset(value: string): value is DatePresetKey {
  return (DATE_PRESET_KEYS as readonly string[]).includes(value);
}

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isCalendarDate(value: string): boolean {
  const m = CALENDAR_DATE.exec(value);
  if (m === null) return false;
  const [, y, mo, d] = m;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    Number(y) >= 1 &&
    parsed.getUTCFullYear() === Number(y) &&
    parsed.getUTCMonth() + 1 === Number(mo) &&
    parsed.getUTCDate() === Number(d)
  );
}

export function isDateConditionValue(value: string): boolean {
  return isDatePreset(value) || isCalendarDate(value);
}
