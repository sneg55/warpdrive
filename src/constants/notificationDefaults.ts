import type { NotificationType } from "./notificationTypes";

export const DEFAULT_EMAIL_BY_TYPE: Record<NotificationType, boolean> = {
  mention: true,
  comment_reply: true,
  activity_assigned: true,
  activity_reminder: true,
  deal_won: true,
  deal_lost: true,
  deal_followed_update: false,
  email_open: false,
  email_click: false,
  deal_email_received: false,
};

export const DEFAULT_IN_APP = true;
