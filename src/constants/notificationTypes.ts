// Notification kinds delivered in-app. The notifications FEATURE lands in Phase 5;
// this constant exists now because the activity-reminder job (Phase 3) writes rows.
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
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
