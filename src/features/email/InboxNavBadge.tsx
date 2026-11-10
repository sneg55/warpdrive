"use client";
import { trpc } from "@/lib/trpc-client";
import { useInboxRealtime } from "./useInboxRealtime";

export function InboxNavBadge({ selfActorId }: { selfActorId: string }): React.ReactNode {
  useInboxRealtime({ selfActorId });
  const count = trpc.email.inbox.unreadCount.useQuery().data ?? 0;
  if (count === 0) return null;
  return (
    <span
      role="status"
      aria-label={`${count} unread emails`}
      className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-xs font-medium tabular-nums text-white"
    >
      {count}
    </span>
  );
}
