export const NOTIFICATION_TYPES = [
  "mention",
  "activity_assigned",
  "activity_reminder",
  "deal_followed_update",
  "email_open",
  "email_click",
  "deal_won",
  "deal_lost",
  "comment_reply",
  "deal_email_received",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
