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

// Read-only Free/Busy signal (Pipedrive parity, B3): the windows in [from, to] during which the
// given user is already booked by another activity assigned to them. NOT a scheduling engine, and
// deliberately coarse: it exposes only busy spans, never activity details. An activity's end is
// its explicit end_at, else due_at + durationMinutes, else due_at itself. Scoped to the user's own
// assignments (deletedAt null); finer per-record visibility is intentionally not applied because
// only busy/free (no content) is returned. Overlap uses half-open bounds (start < to, end > from).
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
