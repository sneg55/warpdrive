import type { NotificationType } from "@/constants/notificationTypes";

export interface CreateNotificationInput {
  recipientId: string;
  type: NotificationType;
  entityType: string | null;
  entityId: string | null;
  actorId: string | null;
  payload: Record<string, unknown>;
}

export interface NotificationRow {
  id: string;
  userId: string;
  type: NotificationType;
  entityType: string | null;
  entityId: string | null;
  actorId: string | null;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationFeedItem extends NotificationRow {
  band: "today" | "earlier";
}
