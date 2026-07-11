"use client";

import type { PresenceUser } from "@/types/presence";
import { usePresence } from "./usePresence";

interface PresenceAvatarsProps {
  users: PresenceUser[];
  selfId: string;
}

// Pure presentational component: renders initials avatars for all users except
// the viewer (selfId), collapsing overflow past 3 into a "+N" badge.
export function PresenceAvatars({ users, selfId }: PresenceAvatarsProps): React.ReactNode {
  const others = users.filter((u) => u.userId !== selfId);
  const shown = others.slice(0, 3);
  const overflow = others.length - shown.length;

  return (
    <div className="flex items-center -space-x-2">
      {shown.map((u) => (
        <span
          key={u.userId}
          title={u.name}
          className="grid size-6 place-items-center rounded-full border border-gray-300 bg-gray-200 text-xs font-medium text-gray-700"
        >
          {u.name.slice(0, 1).toUpperCase()}
        </span>
      ))}
      {overflow > 0 ? (
        <span className="grid size-6 place-items-center rounded-full border border-gray-300 bg-gray-100 text-xs font-medium text-gray-600 tabular-nums">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

interface PresenceBarProps {
  channel: string;
  selfId: string;
}

// Hides itself when only the current user (or nobody) is viewing.
export function PresenceBar({ channel, selfId }: PresenceBarProps): React.ReactNode {
  const users = usePresence(channel);
  if (users.length <= 1) return null;
  return <PresenceAvatars users={users} selfId={selfId} />;
}
