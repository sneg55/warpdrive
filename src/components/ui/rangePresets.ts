import { RANGE_PRESET_KEYS, type RangePresetKey } from "@/constants/rangePresets";
import { assertNever } from "@/types/result";
import { toYmd } from "./dateFormat";

export { RANGE_PRESET_KEYS };

export interface YmdRange {
  from: string;
  to: string;
}

const MONTHS_PER_QUARTER = 3;
const DAYS_PER_WEEK = 7;

function localDay(year: number, month: number, day: number): Date {
  return new Date(year, month, day);
}

function monthRange(year: number, month: number): YmdRange {
  return { from: toYmd(localDay(year, month, 1)), to: toYmd(localDay(year, month + 1, 0)) };
}

function weekRange(today: Date, weeksBack: number): YmdRange {
  const daysSinceMonday = (today.getDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
  const monday = localDay(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - daysSinceMonday - weeksBack * DAYS_PER_WEEK,
  );
  const sunday = localDay(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return { from: toYmd(monday), to: toYmd(sunday) };
}

export function resolveRangePreset(key: RangePresetKey, today: Date): YmdRange {
  const year = today.getFullYear();
  const month = today.getMonth();
  switch (key) {
    case "this_week":
      return weekRange(today, 0);
    case "last_week":
      return weekRange(today, 1);
    case "this_month":
      return monthRange(year, month);
    case "last_month":
      return monthRange(year, month - 1);
    case "next_month":
      return monthRange(year, month + 1);
    case "this_quarter": {
      const first = month - (month % MONTHS_PER_QUARTER);
      return {
        from: toYmd(localDay(year, first, 1)),
        to: toYmd(localDay(year, first + MONTHS_PER_QUARTER, 0)),
      };
    }
    case "this_year":
      return { from: toYmd(localDay(year, 0, 1)), to: toYmd(localDay(year, 12, 0)) };
    default:
      return assertNever(key);
  }
}
