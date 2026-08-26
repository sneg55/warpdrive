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
import { followContactAction, unfollowContactAction } from "@/features/contacts/followerActions";
import { readCsrfToken } from "@/utils/csrfCookie";

interface ContactFollowersButtonProps {
  entityType: "person" | "organization";
  entityId: string;
  followers: { id: string; name: string; avatarUrl: string | null }[];
  isFollowedBySelf: boolean;
}

// Followers control for the person/org detail header (Wave 3, Task 24), cloned from
// deal-workspace/header/FollowersButton.tsx: a count button that opens a menu listing
// follower avatars + names, with a Follow/Following toggle for the viewer. router.refresh()
// re-runs the detail page's server load (which recomputes followers/isFollowedBySelf via
// getContactFollowers, the same read boundary summaryRepo.ts uses for deals) so the
// server-rendered props flow back down with the fresh state.
export function ContactFollowersButton({
  entityType,
  entityId,
  followers,
  isFollowedBySelf,
}: ContactFollowersButtonProps): React.ReactNode {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggle(): Promise<void> {
    if (pending) return;
    setPending(true);
    const action = isFollowedBySelf ? unfollowContactAction : followContactAction;
    const r = await action({ entityType, entityId }, readCsrfToken());
    setPending(false);
    if (r.ok) router.refresh();
  }

  const count = followers.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={`${ICON_BUTTON} gap-1.5 text-sm tabular-nums`}>
        <Users aria-hidden="true" className="h-4 w-4" />
        {count} {count === 1 ? "follower" : "followers"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
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
