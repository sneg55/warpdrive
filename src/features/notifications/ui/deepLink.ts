import type { NotificationType } from "@/constants/notificationTypes";
import { entityHref } from "@/features/notifications/entityHref";
import type { NotificationFeedItem } from "@/types/notification";

const FALLBACK: Record<NotificationType, string> = {
  mention: "/",
  activity_assigned: "/activities/calendar",
  activity_reminder: "/activities/calendar",
  deal_followed_update: "/",
  email_open: "/inbox",
  email_click: "/inbox",
  deal_won: "/",
  deal_lost: "/",
  comment_reply: "/",
  deal_email_received: "/",
};

function threadHref(item: NotificationFeedItem): string | null {
  const threadId = typeof item.payload.threadId === "string" ? item.payload.threadId : null;
  return threadId !== null ? `/inbox/${threadId}` : null;
}

export function notificationHref(item: NotificationFeedItem): string {
  if (item.type === "email_open" || item.type === "email_click") {
    return threadHref(item) ?? FALLBACK[item.type];
  }
  return entityHref(item.entityType, item.entityId) ?? FALLBACK[item.type];
}
