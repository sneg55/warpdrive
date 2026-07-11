"use client";
import Link from "next/link";
import type React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
}: {
  userId: string;
  userName?: string;
  // The signed-in user's uploaded photo (users.avatar_url). When set, the button shows the photo
  // instead of the deterministic initials/glyph so a user actually sees the avatar they set.
  avatarUrl?: string | null;
}): React.ReactNode {
  const hasPhoto = avatarUrl !== undefined && avatarUrl !== null && avatarUrl !== "";
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
            <PersonGlyph />
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent aria-label="Account" align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          My account
        </DropdownMenuLabel>
        <DropdownMenuItem asChild className="gap-2.5">
          <Link href="/settings/users">
            <GearIcon />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="gap-2.5">
          <a href="/auth/logout">
            <LogoutIcon />
            Log out
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PersonGlyph(): React.ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" />
    </svg>
  );
}

function GearIcon(): React.ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 text-muted-foreground"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function LogoutIcon(): React.ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 text-muted-foreground"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}
