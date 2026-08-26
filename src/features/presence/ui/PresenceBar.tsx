"use client";

import { Tip } from "@/components/ui/tooltip";
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
        <Tip key={u.userId} label={u.name}>
          <span
            role="img"
            aria-label={u.name}
            className="grid size-6 place-items-center rounded-full border bg-muted text-xs font-medium text-foreground"
          >
            {u.name.slice(0, 1).toUpperCase()}
          </span>
        </Tip>
      ))}
      {overflow > 0 ? (
        <span className="grid size-6 place-items-center rounded-full border bg-muted text-xs font-medium text-muted-foreground tabular-nums">
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
