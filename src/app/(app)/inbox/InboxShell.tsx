import type React from "react";
import { InboxFolderRail } from "@/features/email/InboxFolderRail";

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
