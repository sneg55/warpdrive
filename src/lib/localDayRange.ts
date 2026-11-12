import { type SQL, sql } from "drizzle-orm";

export const FALLBACK_ZONE = "UTC";

export function resolveTimeZone(timeZone: string | null | undefined): string {
  if (timeZone === null || timeZone === undefined || timeZone === "") return FALLBACK_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return FALLBACK_ZONE;
  }
}

export function localDayStart(day: SQL, zone: string): SQL {
  return sql`((${day})::timestamp AT TIME ZONE ${zone})`;
}

export function startOfLocalDay(day: string, zone: string): SQL {
  return localDayStart(sql`${day}::date`, zone);
}

export function endOfLocalDay(day: string, zone: string): SQL {
  return localDayStart(sql`${day}::date + 1`, zone);
}

export function withinLocalDays(column: SQL, from: string, to: string, zone: string): SQL {
  return sql`${column} >= ${startOfLocalDay(from, zone)} AND ${column} < ${endOfLocalDay(to, zone)}`;
}
