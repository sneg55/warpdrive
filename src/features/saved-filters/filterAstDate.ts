import { type SQL, sql } from "drizzle-orm";
import { type DatePresetKey, isCalendarDate, isDatePreset } from "@/constants/dateFilterPresets";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { requireValue } from "./filterAstSql";

type DateColumnKind = "date" | "timestamptz";

const DATE_COLUMN_KIND: Record<string, DateColumnKind> = {
  expectedCloseDate: "date",
  nextActivityAt: "timestamptz",
  lastActivityAt: "timestamptz",
};

const FALLBACK_ZONE = "UTC";

export function resolveTimeZone(timeZone: string | null | undefined): string {
  if (timeZone === null || timeZone === undefined || timeZone === "") return FALLBACK_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return FALLBACK_ZONE;
  }
}

interface DayRange {
  start: SQL;
  end: SQL;
}

type RangeBuilder = (today: SQL) => DayRange;

const PRESET_RANGE: Record<DatePresetKey, RangeBuilder> = {
  today: (t) => ({ start: t, end: sql`${t} + 1` }),
  yesterday: (t) => ({ start: sql`${t} - 1`, end: t }),
  tomorrow: (t) => ({ start: sql`${t} + 1`, end: sql`${t} + 2` }),
  this_week: (t) => ({ start: weekStart(t), end: sql`${weekStart(t)} + 7` }),
  last_week: (t) => ({ start: sql`${weekStart(t)} - 7`, end: weekStart(t) }),
  next_week: (t) => ({ start: sql`${weekStart(t)} + 7`, end: sql`${weekStart(t)} + 14` }),
  this_month: (t) => ({
    start: sql`${monthStart(t)}::date`,
    end: sql`(${monthStart(t)} + interval '1 month')::date`,
  }),
  last_month: (t) => ({
    start: sql`(${monthStart(t)} - interval '1 month')::date`,
    end: sql`${monthStart(t)}::date`,
  }),
  next_month: (t) => ({
    start: sql`(${monthStart(t)} + interval '1 month')::date`,
    end: sql`(${monthStart(t)} + interval '2 month')::date`,
  }),
  last_7_days: (t) => ({ start: sql`${t} - 6`, end: sql`${t} + 1` }),
  next_7_days: (t) => ({ start: t, end: sql`${t} + 7` }),
  last_30_days: (t) => ({ start: sql`${t} - 29`, end: sql`${t} + 1` }),
  next_30_days: (t) => ({ start: t, end: sql`${t} + 30` }),
};

function weekStart(today: SQL): SQL {
  return sql`date_trunc('week', ${today})::date`;
}

function monthStart(today: SQL): SQL {
  return sql`date_trunc('month', ${today})`;
}

function localDayRange(op: string, raw: string | number | string[], zone: string): DayRange {
  if (Array.isArray(raw)) {
    throw new AppError(ERROR_IDS.DEAL_FILTER_INVALID, "List value on a date field", { op });
  }
  const value = String(raw);
  if (isDatePreset(value)) return PRESET_RANGE[value](sql`(now() AT TIME ZONE ${zone})::date`);
  if (!isCalendarDate(value)) {
    throw new AppError(ERROR_IDS.DEAL_FILTER_INVALID, "Date field needs a date or a preset", {
      op,
    });
  }
  return { start: sql`${value}::date`, end: sql`${value}::date + 1` };
}

function asInstant(day: SQL, zone: string): SQL {
  return sql`((${day})::timestamp AT TIME ZONE ${zone})`;
}

function columnRange(field: string, op: string, raw: string | number | string[], zone: string) {
  const kind = DATE_COLUMN_KIND[field];
  if (kind === undefined) {
    throw new AppError(ERROR_IDS.DEAL_FILTER_INVALID, "Not a date filter field", { field });
  }
  const local = localDayRange(op, raw, zone);
  if (kind === "date") return local;
  return { start: asInstant(local.start, zone), end: asInstant(local.end, zone) };
}

export function dateCondition(
  colSql: SQL,
  field: string,
  op: string,
  value: string | number | string[] | undefined,
  timeZone: string | null | undefined,
): SQL {
  const zone = resolveTimeZone(timeZone);
  const { start, end } = columnRange(field, op, requireValue(op, value), zone);
  switch (op) {
    case "eq":
      return sql`(${colSql} >= ${start} AND ${colSql} < ${end})`;
    case "neq":
      return sql`(${colSql} IS NULL OR ${colSql} < ${start} OR ${colSql} >= ${end})`;
    case "gt":
      return sql`${colSql} >= ${end}`;
    case "gte":
      return sql`${colSql} >= ${start}`;
    case "lt":
      return sql`${colSql} < ${start}`;
    case "lte":
      return sql`${colSql} < ${end}`;
    default:
      throw new AppError(ERROR_IDS.DEAL_FILTER_INVALID, "Unsupported operator on a date field", {
        op,
      });
  }
}
