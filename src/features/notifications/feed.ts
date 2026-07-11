// Read-time-filtered notification feed.
//
// Visibility is re-checked at read time because an entity's visibility can change after
// a notification row is written. Rather than duplicating entity-specific SQL predicates
// (which would silently miss activity/email_message types and diverge from the vetted
// dispatch), each row is filtered in-process through canActorAccessParent, the SAME
// dispatch the Task 2 producer uses.
//
// Over-fetch approach: load up to limit * 3 rows (capped at 300) then filter and return
// the first `limit` survivors. This is simple and bounded. A user's notification set is
// expected to be small (hundreds, not millions). If a pathological case emerges (many
// hidden rows) a cursor-based page-until-full strategy can replace this without changing
// the contract.
//
// Band: UTC day boundary. "today" = created_at on or after midnight UTC today. Chosen
// over local-time because the server has no user timezone and UTC is consistent.
//
// In-app preference filter: getPreferences is resolved once per call and applied
// alongside the visibility filter. Rows whose type the user disabled in-app are hidden
// from the feed and unread count. The notification row is still stored so email-only
// delivery keeps working (the email-dispatch job loads the row by id).
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

// Returns true if the notification row should be visible to the user.
// Null-entity rows (system notifications with no gating entity) always pass.
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

// Load the newest notifications for the user, filter by read-time visibility and
// in-app preference, and return up to `limit` survivors newest-first with today/earlier
// banding.
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
    // Fail-open for unknown types: only suppress when inApp is explicitly false.
    if (prefs[row.type].inApp === false) continue;
    const ok = await isVisible(db, user, row, signal);
    if (ok) visible.push(toFeedItem(row));
  }
  return visible;
}

// Count unread notifications that pass read-time visibility and in-app preference.
// Loads unread rows, filters, and counts survivors. Bounded at MAX_FETCH since a user's
// unread set is expected to be small in practice.
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

// Mark a single notification read. Owner-scoped: the user_id = user.id guard ensures
// alice can never mark bob's row read, even if she knows the id.
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

// Mark all of the user's unread notifications read.
export async function markAllRead(db: Db, user: AuthUser, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
}
