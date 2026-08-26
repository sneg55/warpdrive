"use client";
import { Users } from "lucide-react";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ICON_BUTTON } from "@/constants/formStyles";
import { followDealAction, unfollowDealAction } from "@/features/deal-workspace/actions";
import { readCsrfToken } from "@/utils/csrfCookie";

interface FollowersButtonProps {
  dealId: string;
  followers: { id: string; name: string; avatarUrl: string | null }[];
  isFollowedBySelf: boolean;
}

// Followers control (Pipedrive parity): a count button that opens a menu listing follower avatars +
// names, with a Follow/Following toggle for the viewer. The toggle calls follow/unfollow per the
// current self-follow state and refreshes so the server-rendered count updates.
export function FollowersButton({
  dealId,
  followers,
  isFollowedBySelf,
}: FollowersButtonProps): React.ReactNode {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggle(): Promise<void> {
    if (pending) return;
    setPending(true);
    const action = isFollowedBySelf ? unfollowDealAction : followDealAction;
    const r = await action({ dealId }, readCsrfToken());
    setPending(false);
    if (r.ok) router.refresh();
  }

  const count = followers.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={`${ICON_BUTTON} gap-1.5 text-sm`}>
        <Users aria-hidden="true" className="h-4 w-4" />
        <span className="tabular-nums">{count}</span> {count === 1 ? "follower" : "followers"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-label="Followers" className="min-w-52">
        <DropdownMenuItem disabled={pending} onSelect={() => void toggle()} className="font-medium">
          {isFollowedBySelf ? "Following" : "Follow"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {count === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No followers yet</p>
        ) : (
          followers.map((f) => (
            <div key={f.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
              <Avatar name={f.name} src={f.avatarUrl} className="h-6 w-6 text-[10px]" />
              <span className="truncate">{f.name}</span>
            </div>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
