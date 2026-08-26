"use client";

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { STRINGS } from "@/constants/strings";
import { markAllReadAction, markReadAction } from "@/features/notifications/actions";
import { trpc } from "@/lib/trpc-client";
import type { NotificationFeedItem } from "@/types/notification";
import { readCsrfToken } from "@/utils/csrfCookie";
import { notificationHref } from "./deepLink";
import { NotificationItem } from "./NotificationItem";
import { useNotificationStream } from "./useNotificationStream";

export function NotificationsBell({ userId }: { userId: string }): React.ReactNode {
  useNotificationStream(userId);
  const router = useRouter();
  const utils = trpc.useUtils();
  const reportError = useActionError();
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const countQuery = trpc.notifications.unreadCount.useQuery();
  const feedQuery = trpc.notifications.feed.useQuery({ limit: 50 });

  const feed = feedQuery.data ?? [];
  const unreadCount = countQuery.data ?? 0;
  const today = feed.filter((n) => n.band === "today");
  const earlier = feed.filter((n) => n.band === "earlier");

  async function handleOpen(item: NotificationFeedItem): Promise<void> {
    if (item.readAt === null) {
      const result = await markReadAction({ id: item.id }, readCsrfToken());
      if (result.ok) {
        void utils.notifications.feed.invalidate();
        void utils.notifications.unreadCount.invalidate();
      }
    }
    setOpen(false);
    router.push(notificationHref(item));
  }

  async function handleMarkAll(): Promise<void> {
    setMarkingAll(true);
    const result = await markAllReadAction(readCsrfToken());
    setMarkingAll(false);
    if (result.ok) {
      void utils.notifications.feed.invalidate();
      void utils.notifications.unreadCount.invalidate();
    } else {
      reportError(result.error.id);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={STRINGS.notifications.title}
        className="relative flex h-10 w-10 items-center justify-center rounded-md transition-transform hover:bg-accent active:scale-[0.96]"
      >
        <Bell aria-hidden className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-xs font-medium tabular-nums text-white">
            {unreadCount}
          </span>
        ) : null}
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">{STRINGS.notifications.title}</span>
          <button
            type="button"
            disabled={markingAll || unreadCount === 0}
            onClick={() => void handleMarkAll()}
            className="text-xs text-link disabled:opacity-40 hover:underline"
          >
            {STRINGS.notifications.markAllRead}
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {feed.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              {STRINGS.notifications.empty}
            </p>
          ) : null}

          {today.length > 0 ? (
            <>
              <p className="px-3 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {STRINGS.notifications.today}
              </p>
              {today.map((n) => (
                <NotificationItem key={n.id} item={n} onOpen={(item) => void handleOpen(item)} />
              ))}
            </>
          ) : null}

          {earlier.length > 0 ? (
            <>
              <p className="px-3 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {STRINGS.notifications.earlier}
              </p>
              {earlier.map((n) => (
                <NotificationItem key={n.id} item={n} onOpen={(item) => void handleOpen(item)} />
              ))}
            </>
          ) : null}
        </div>

        <div className="border-t">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push("/activities/calendar");
            }}
            className="w-full px-3 py-2 text-center text-xs text-link hover:underline"
          >
            {STRINGS.notifications.seeAll}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
