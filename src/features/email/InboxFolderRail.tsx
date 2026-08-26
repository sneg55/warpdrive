"use client";
import { Archive, Inbox, type LucideIcon, Pencil, Send, SendHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type React from "react";
import { Tip } from "@/components/ui/tooltip";
import { STRINGS } from "@/constants/strings";
import { trpc } from "@/lib/trpc-client";
import { cn } from "@/lib/utils";
import { FOLDER_KEYS, FOLDER_LABELS, type FolderKey, parseFolder } from "./inboxFolders";

const COMPOSE_PATH = "/inbox/compose";

// The rail lives in the persistent /inbox layout, so it reads the active state straight from the
// router (it never remounts on navigation). Compose highlights the New email action; a reader route
// (/inbox/<threadId>) keeps Inbox lit; the list route reflects its ?folder= param.
function deriveActive(
  pathname: string,
  params: URLSearchParams,
): { folder: FolderKey | null; composeActive: boolean } {
  if (pathname === COMPOSE_PATH) return { folder: null, composeActive: true };
  if (pathname.startsWith("/inbox/")) return { folder: "inbox", composeActive: false };
  return { folder: parseFolder(params.get("folder")), composeActive: false };
}

const ICONS: Record<FolderKey, LucideIcon> = {
  inbox: Inbox,
  drafts: Pencil,
  outbox: SendHorizontal,
  sent: Send,
  archive: Archive,
};

const NEW_EMAIL_BUTTON_CLASSES =
  "mb-2 flex items-center justify-center gap-2 rounded-md bg-action px-3 py-2 text-sm font-medium text-action-foreground transition-transform active:scale-[0.96]";

export function InboxFolderRail({
  newEmailEnabled,
}: {
  newEmailEnabled: boolean;
}): React.ReactNode {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { folder: activeFolder, composeActive } = deriveActive(pathname, searchParams);
  const unreadCount = trpc.email.inbox.unreadCount.useQuery().data ?? 0;
  return (
    <nav aria-label="Mail folders" className="flex w-60 shrink-0 flex-col gap-1 border-r p-3">
      {/* A disabled Link has no real-world meaning (it would still be clickable), so the
          no-mailbox state renders a genuinely inert disabled button instead of a navigable
          link; only the enabled state navigates to the full-pane compose route. */}
      {newEmailEnabled ? (
        <Tip label="Compose a new email">
          <Link
            href="/inbox/compose"
            aria-current={composeActive ? "page" : undefined}
            className={cn(
              NEW_EMAIL_BUTTON_CLASSES,
              composeActive && "ring-2 ring-ring ring-offset-1",
            )}
          >
            <span aria-hidden="true">+</span> {STRINGS.inbox.composeTitle}
          </Link>
        </Tip>
      ) : (
        <Tip label="Compose needs a connected mailbox">
          <button
            type="button"
            disabled
            className={cn(NEW_EMAIL_BUTTON_CLASSES, "cursor-not-allowed opacity-60")}
          >
            <span aria-hidden="true">+</span> {STRINGS.inbox.composeTitle}
          </button>
        </Tip>
      )}

      {FOLDER_KEYS.map((key) => {
        const Glyph = ICONS[key];
        return (
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
            <Glyph aria-hidden="true" className="h-4 w-4" />
            <span>{FOLDER_LABELS[key]}</span>
            {key === "inbox" && unreadCount > 0 && (
              <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground tabular-nums">
                {unreadCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
