"use client";

import type { NotificationType } from "@/constants/notificationTypes";
import { STRINGS } from "@/constants/strings";
import type { NotificationFeedItem } from "@/types/notification";

const L = STRINGS.notifications.labels;

function toStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

// Per-type label builders. Base words come from STRINGS.notifications.labels.
const LABEL: Record<NotificationType, (p: Record<string, unknown>) => string> = {
  mention: (p) =>
    `${L.mention}${typeof p.title === "string" && p.title.length > 0 ? ` in ${p.title}` : ""}`,
  activity_assigned: (p) => `${L.activity_assigned}: ${toStr(p.subject)}`,
  activity_reminder: (p) => `${L.activity_reminder}: ${toStr(p.subject)}`,
  deal_followed_update: (p) =>
    `${L.deal_followed_update}: ${toStr(p.changeSummary) || L.deal_followed_update_fallback}`,
  email_open: () => L.email_open,
  email_click: () => L.email_click,
  deal_won: () => L.deal_won,
  deal_lost: () => L.deal_lost,
  comment_reply: () => L.comment_reply,
  deal_email_received: (p) =>
    `${L.deal_email_received}: ${toStr(p.subject) || L.deal_email_received_fallback}`,
};

export function NotificationItem({
  item,
  onOpen,
}: {
  item: NotificationFeedItem;
  onOpen: (item: NotificationFeedItem) => void;
}): React.ReactNode {
  const unread = item.readAt === null;
  const text = LABEL[item.type](item.payload);

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={
        unread
          ? "flex w-full items-center gap-2 bg-blue-50 px-3 py-2 text-left hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/50"
          : "flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent"
      }
    >
      {unread ? (
        <span data-testid="unread-dot" className="size-2 flex-shrink-0 rounded-full bg-blue-500" />
      ) : null}
      <span className="truncate text-sm">{text}</span>
    </button>
  );
}
