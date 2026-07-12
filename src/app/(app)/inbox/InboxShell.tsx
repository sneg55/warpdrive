import type React from "react";
import { InboxFolderRail } from "@/features/email/InboxFolderRail";

// Persistent inbox frame (Pipedrive Sales Inbox parity): the folder rail sits to the left of the
// route content on every /inbox route. Because this shell renders from the shared inbox layout, the
// rail stays mounted across list -> reader -> compose client navigations (no flash, scroll kept),
// and its active highlight tracks the route via the router hooks it reads internally.
export function InboxShell({
  newEmailEnabled,
  children,
}: {
  newEmailEnabled: boolean;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="flex h-full min-h-0">
      <InboxFolderRail newEmailEnabled={newEmailEnabled} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
