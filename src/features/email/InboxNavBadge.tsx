"use client";
import { trpc } from "@/lib/trpc-client";
import { useInboxRealtime } from "./useInboxRealtime";

export function InboxNavBadge({ selfActorId }: { selfActorId: string }): React.ReactNode {
  useInboxRealtime({ selfActorId });
  const emailCount = trpc.email.inbox.unreadCount.useQuery().data ?? 0;
  const xEnabled = trpc.xDms.enabled.useQuery().data === true;
  const xCount = trpc.xDms.unreadCount.useQuery({}, { enabled: xEnabled }).data ?? 0;
  const count = emailCount + (xEnabled ? xCount : 0);
  if (count === 0) return null;
  return (
    <span
      role="status"
      aria-label={`${count} unread`}
      className="flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-xs font-medium tabular-nums text-white"
    >
      {count}
    </span>
  );
}
