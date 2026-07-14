// Per-contact activity stats for the person/org detail "Overview" section (CO-2). Reuses
// listActivitiesForEntity so the counts stay visibility-consistent with the Activity feed, then
// folds them into totals + per-type counts + a last-activity/inactive-days pair. The inactive-days
// math mirrors dealOverview.ts (calendar-day count), but is activity-scoped: with no completed
// activity there is nothing to date from, so lastActivityAt/inactiveDays are null (no createdAt
// fallback).
import type { Db } from "@/db/client";
import type { CalendarActivity } from "@/features/activities/calendar";
import { listActivitiesForEntity } from "@/features/activities/forEntity";
import type { PermSetUser } from "@/features/permissions/effective";
import { assertReferenceVisible } from "@/features/permissions/referenceCheck";
import { calendarDaysBetween } from "@/lib/calendarDays";
import { toRefActor } from "./actorAdapters";

// Pipedrive's Overview shows up to this many "Most active users".
const MAX_ACTIVE_USERS = 3;

// Stats for a contact the actor cannot see: never leak counts/last-activity for a hidden record.
const HIDDEN_STATS: ContactActivityStats = {
  total: 0,
  done: 0,
  open: 0,
  byType: {},
  mostActiveUsers: [],
  lastActivityAt: null,
  inactiveDays: null,
};

export interface ContactActivityStats {
  total: number;
  done: number;
  open: number;
  // typeKey -> count, over every activity (done or open).
  byType: Record<string, number>;
  // Owners ranked by activity count, descending (PD's "Most active users"). Unowned activities
  // are excluded. Capped to the top MAX_ACTIVE_USERS.
  mostActiveUsers: Array<{ name: string; count: number }>;
  // Most recent DONE activity's due date, or null when none is completed.
  lastActivityAt: Date | null;
  // Whole days since lastActivityAt, or null when there is no completed activity.
  inactiveDays: number | null;
}

export function computeActivityStats(list: CalendarActivity[], now: Date): ContactActivityStats {
  let done = 0;
  const byType: Record<string, number> = {};
  const byUser = new Map<string, number>();
  let lastActivityAt: Date | null = null;

  for (const a of list) {
    byType[a.typeKey] = (byType[a.typeKey] ?? 0) + 1;
    if (a.ownerName !== null && a.ownerName !== "") {
      byUser.set(a.ownerName, (byUser.get(a.ownerName) ?? 0) + 1);
    }
    if (a.done) {
      done += 1;
      if (lastActivityAt === null || a.dueAt.getTime() > lastActivityAt.getTime()) {
        lastActivityAt = a.dueAt;
      }
    }
  }

  const mostActiveUsers = [...byUser.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, MAX_ACTIVE_USERS);

  const inactiveDays =
    lastActivityAt === null ? null : Math.max(0, calendarDaysBetween(lastActivityAt, now));

  return {
    total: list.length,
    done,
    open: list.length - done,
    byType,
    mostActiveUsers,
    lastActivityAt,
    inactiveDays,
  };
}

export async function activityStats(
  db: Db,
  actor: PermSetUser,
  entityType: "person" | "organization",
  entityId: string,
  signal: AbortSignal,
): Promise<ContactActivityStats> {
  signal.throwIfAborted();
  // Gate on entity visibility first (mirrors contactTimeline): activities can be visible via a
  // dominant parent, so listActivitiesForEntity alone could disclose aggregate counts + last
  // activity for a contact the actor cannot open.
  const visible = await assertReferenceVisible(
    db,
    toRefActor(actor),
    { kind: entityType, id: entityId },
    signal,
  );
  if (!visible.ok) return HIDDEN_STATS;
  signal.throwIfAborted();
  const list = await listActivitiesForEntity(db, actor, entityType, entityId, signal);
  signal.throwIfAborted();
  return computeActivityStats(list, new Date());
}
