import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { notifications } from "@/db/schema";
import type { Notification } from "@/db/schema/notifications";
import { canActorAccessParent } from "@/features/files/fileAuthz";
import type { AuthUser } from "@/features/permissions/types";
import type { NotificationFeedItem } from "@/types/notification";
import { getPreferences } from "./preferences";

const MAX_FETCH = 300;

function band(createdAt: Date): "today" | "earlier" {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return createdAt >= todayStart ? "today" : "earlier";
}

function toFeedItem(r: Notification): NotificationFeedItem {
  return {
    id: r.id,
    userId: r.userId,
    type: r.type,
    entityType: r.entityType,
    entityId: r.entityId,
    actorId: r.actorId,
    payload: r.payload,
    readAt: r.readAt ? r.readAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    band: band(r.createdAt),
  };
}

async function isVisible(
  db: Db,
  user: AuthUser,
  row: Notification,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted();
  if (row.entityType === null || row.entityId === null) return true;
  return canActorAccessParent(db, user, row.entityType, row.entityId, signal);
}

export async function getFeed(
  db: Db,
  user: AuthUser,
  limit: number,
  signal: AbortSignal,
): Promise<NotificationFeedItem[]> {
  signal.throwIfAborted();
  const fetchCount = Math.min(limit * 3, MAX_FETCH);
  const [rows, prefs] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(fetchCount),
    getPreferences(db, user.id, signal),
  ]);
  signal.throwIfAborted();

  const visible: NotificationFeedItem[] = [];
  for (const row of rows) {
    if (visible.length >= limit) break;
    if (prefs[row.type].inApp === false) continue;
    const ok = await isVisible(db, user, row, signal);
    if (ok) visible.push(toFeedItem(row));
  }
  return visible;
}

export async function getUnreadCount(db: Db, user: AuthUser, signal: AbortSignal): Promise<number> {
  signal.throwIfAborted();
  const [rows, prefs] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)))
      .orderBy(desc(notifications.createdAt))
      .limit(MAX_FETCH),
    getPreferences(db, user.id, signal),
  ]);
  signal.throwIfAborted();

  let count = 0;
  for (const row of rows) {
    if (prefs[row.type].inApp === false) continue;
    const ok = await isVisible(db, user, row, signal);
    if (ok) count++;
  }
  return count;
}

export async function markRead(
  db: Db,
  user: AuthUser,
  notificationId: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, user.id),
        isNull(notifications.readAt),
      ),
    );
}

export async function markAllRead(db: Db, user: AuthUser, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
}
