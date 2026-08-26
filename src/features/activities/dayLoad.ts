import { and, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { activities } from "@/db/schema";

export interface DayLoadQuery {
  userId: string;
  from: Date;
  to: Date;
  timeZone: string;
}

function toZonePostgresAccepts(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

export async function getDayLoad(
  db: Db,
  query: DayLoadQuery,
  signal: AbortSignal,
): Promise<Record<string, number>> {
  signal.throwIfAborted();
  const zone = toZonePostgresAccepts(query.timeZone);
  const dueDayInZone = sql<string>`to_char(${activities.dueAt} AT TIME ZONE ${zone}::text, 'YYYY-MM-DD')`;
  const rows = await db
    .select({ day: dueDayInZone, count: sql<number>`count(*)::int` })
    .from(activities)
    .where(
      and(
        eq(activities.assigneeId, query.userId),
        isNull(activities.deletedAt),
        isNotNull(activities.dueAt),
        gte(activities.dueAt, query.from),
        lte(activities.dueAt, query.to),
      ),
    )
    .groupBy(sql`1`);
  signal.throwIfAborted();
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.day] = row.count;
  return counts;
}
