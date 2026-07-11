"use client";
import Link from "next/link";
import type React from "react";
import { trpc } from "@/lib/trpc-client";
import { cn } from "@/lib/utils";
import { FOLDER_KEYS, FOLDER_LABELS, type FolderKey } from "./inboxFolders";

// Icon paths keyed by folder. Kept inline (small) so the rail stays a single file.
const ICONS: Record<FolderKey, string> = {
  inbox: "M4 4h16v12H5.2L4 17.5z",
  drafts: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  outbox: "M4 4h16v16H4zM4 12h4l2 3h4l2-3h4",
  sent: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  archive: "M3 4h18v4H3zM5 8v12h14V8M9 12h6",
};

function Icon({ d }: { d: string }): React.ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

export function InboxFolderRail({
  activeFolder,
  newEmailEnabled,
  onNewEmail,
}: {
  activeFolder: FolderKey;
  newEmailEnabled: boolean;
  onNewEmail: () => void;
}): React.ReactNode {
  const unreadCount = trpc.email.inbox.unreadCount.useQuery().data ?? 0;
  return (
    <nav aria-label="Mail folders" className="flex w-52 shrink-0 flex-col gap-1 border-r p-3">
      <button
        type="button"
        disabled={!newEmailEnabled}
        onClick={onNewEmail}
        title={newEmailEnabled ? "Compose a new email" : "Compose needs a connected mailbox"}
        className={cn(
          "mb-2 flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.96]",
          !newEmailEnabled && "cursor-not-allowed opacity-60",
        )}
      >
        <span aria-hidden="true">+</span> New email
      </button>

      {FOLDER_KEYS.map((key) => (
        <Link
          key={key}
          href={`/inbox?folder=${key}`}
          aria-current={activeFolder === key ? "page" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm",
            activeFolder === key
              ? "bg-accent font-medium text-accent-foreground"
              : "text-foreground hover:bg-accent",
          )}
        >
          <Icon d={ICONS[key]} />
          <span>{FOLDER_LABELS[key]}</span>
          {key === "inbox" && unreadCount > 0 && (
            <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground tabular-nums">
              {unreadCount}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
