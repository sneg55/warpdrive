"use client";
import { LogOut, Settings, User } from "lucide-react";
import Link from "next/link";
import type React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppearanceMenuSection } from "@/features/theme/AppearanceMenuSection";
import { APPEARANCE_DEFAULT, type Appearance } from "@/features/theme/appearance";
import { useAppearanceChoice } from "@/features/theme/useAppearanceChoice";
import { avatarColorClass, initials } from "@/lib/avatar";
import { cn } from "@/lib/utils";

// Top-right account menu (Pipedrive convention): an avatar button that opens a small dropdown
// with Settings and Log out. Built on the shadcn DropdownMenu primitive (focus trap, keyboard
// nav, portal). The actor carries no display name, so the avatar is a person glyph tinted
// deterministically by userId. Log out is a plain anchor (GET /auth/logout) so Next never
// prefetches it; Settings is a client-side Link. Both render via asChild so the menu item
// semantics wrap the navigation element.
export function UserMenu({
  userId,
  userName,
  avatarUrl,
  appearance = APPEARANCE_DEFAULT,
}: {
  userId: string;
  userName?: string;
  // The signed-in user's uploaded photo (users.avatar_url). When set, the button shows the photo
  // instead of the deterministic initials/glyph so a user actually sees the avatar they set.
  avatarUrl?: string | null;
  // The account's stored theme, so the menu opens on the choice already in effect.
  appearance?: Appearance;
}): React.ReactNode {
  const hasPhoto = avatarUrl !== undefined && avatarUrl !== null && avatarUrl !== "";
  // Held here rather than in the menu content, which Radix unmounts on close.
  const appearanceChoice = useAppearanceChoice(appearance);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className={cn(
            "flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-xs font-semibold transition-transform active:scale-[0.96]",
            // Skip the tinted background when a photo fills the circle.
            hasPhoto
              ? "outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
              : avatarColorClass(userName !== undefined && userName !== "" ? userName : userId),
          )}
        >
          {hasPhoto ? (
            // biome-ignore lint/performance/noImgElement: tiny header avatar, next/image not warranted
            <img
              src={avatarUrl}
              alt={userName ?? "Account"}
              className="h-full w-full rounded-full object-cover"
            />
          ) : userName !== undefined && userName !== "" ? (
            initials(userName)
          ) : (
            <User aria-hidden="true" className="h-4 w-4" />
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent aria-label="Account" align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          My account
        </DropdownMenuLabel>
        <DropdownMenuItem asChild className="gap-2.5">
          <Link href="/settings/profile">
            <Settings aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="gap-2.5">
          <a href="/auth/logout">
            <LogOut aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            Log out
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <AppearanceMenuSection choice={appearanceChoice} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
