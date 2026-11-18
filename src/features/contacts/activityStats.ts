import type { Db } from "@/db/client";
import type { CalendarActivity } from "@/features/activities/calendar";
import { listActivitiesForEntity } from "@/features/activities/forEntity";
import type { PermSetUser } from "@/features/permissions/effective";
import { assertReferenceVisible } from "@/features/permissions/referenceCheck";
import { calendarDaysBetween } from "@/lib/calendarDays";
import { toRefActor } from "./actorAdapters";

const MAX_ACTIVE_USERS = 3;

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
  byType: Record<string, number>;
  mostActiveUsers: Array<{ name: string; count: number }>;
  lastActivityAt: Date | null;
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
