export const RANGE_PRESET_KEYS = [
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "next_month",
  "this_quarter",
  "this_year",
] as const;

export type RangePresetKey = (typeof RANGE_PRESET_KEYS)[number];

export const RANGE_PRESET_LABELS: Record<RangePresetKey, string> = {
  this_week: "This week",
  last_week: "Last week",
  this_month: "This month",
  last_month: "Last month",
  next_month: "Next month",
  this_quarter: "This quarter",
  this_year: "This year",
};
