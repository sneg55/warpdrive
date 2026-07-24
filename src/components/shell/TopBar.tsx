import Link from "next/link";
import type React from "react";
import { STRINGS } from "@/constants/strings";
import { NotificationsBell } from "@/features/notifications/ui/NotificationsBell";
import { GlobalAddMenu } from "@/features/quick-add/GlobalAddMenu";
import { SearchTrigger } from "./SearchTrigger";
import { UserMenu } from "./UserMenu";

export function TopBar({
  userId,
  userName,
  avatarUrl,
}: {
  userId: string;
  userName?: string;
  avatarUrl?: string | null;
}): React.ReactNode {
  return (
    <header className="flex h-14 items-center gap-4 border-b bg-background px-4">
      <Link
        href="/pipeline"
        aria-label={`${STRINGS.app.name} home`}
        className="w-44 shrink-0 text-base font-semibold tracking-tight transition-opacity hover:opacity-80"
      >
        {STRINGS.app.name}
      </Link>
      <div className="mx-auto flex w-full max-w-lg items-center gap-2">
        <search className="min-w-0 flex-1">
          <SearchTrigger />
        </search>
        {/* Global quick-add: opens Deal/Lead/Person/Organization create modals from any page. */}
        <GlobalAddMenu />
      </div>
      <div className="flex w-44 shrink-0 items-center justify-end gap-3">
        <NotificationsBell userId={userId} />
        <UserMenu userId={userId} userName={userName} avatarUrl={avatarUrl} />
      </div>
    </header>
  );
}
