import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { activities } from "@/db/schema";

export interface BusyWindow {
  start: Date;
  end: Date;
}

interface AvailabilityQuery {
  userId: string;
  from: Date;
  to: Date;
}

export async function getBusyWindows(
  db: Db,
  query: AvailabilityQuery,
  signal: AbortSignal,
): Promise<BusyWindow[]> {
  signal.throwIfAborted();
  const activityEnd = sql<Date>`COALESCE(${activities.endAt}, ${activities.dueAt} + make_interval(mins => COALESCE(${activities.durationMinutes}, 0)))`;
  const rows = await db
    .select({ start: activities.dueAt, end: activityEnd })
    .from(activities)
    .where(
      and(
        eq(activities.assigneeId, query.userId),
        isNull(activities.deletedAt),
        isNotNull(activities.dueAt),
        sql`${activities.dueAt} < ${query.to.toISOString()}`,
        sql`${activityEnd} > ${query.from.toISOString()}`,
      ),
    );
  signal.throwIfAborted();
  return rows
    .filter((r): r is { start: Date; end: Date } => r.start !== null)
    .map((r) => ({ start: r.start, end: r.end }));
}
