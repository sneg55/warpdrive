"use client";
import { Archive, Inbox, type LucideIcon, Pencil, Send, SendHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type React from "react";
import { Tip } from "@/components/ui/tooltip";
import { STRINGS } from "@/constants/strings";
import { XAccountRailLinks } from "@/features/x-dms/ui/XAccountRailLinks";
import { trpc } from "@/lib/trpc-client";
import { cn } from "@/lib/utils";
import { FOLDER_KEYS, FOLDER_LABELS, type FolderKey, parseFolder } from "./inboxFolders";

const COMPOSE_PATH = "/inbox/compose";
const X_INBOX_PREFIX = "/inbox/x/";

function activeXAccount(pathname: string): string | null {
  if (!pathname.startsWith(X_INBOX_PREFIX)) return null;
  return pathname.slice(X_INBOX_PREFIX.length).split("/")[0] ?? null;
}

function deriveActive(
  pathname: string,
  params: URLSearchParams,
): { folder: FolderKey | null; composeActive: boolean } {
  if (pathname === COMPOSE_PATH) return { folder: null, composeActive: true };
  if (pathname.startsWith(X_INBOX_PREFIX)) return { folder: null, composeActive: false };
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
  const mailbox = searchParams.get("mailbox");
  const choices = trpc.email.mailboxes.useQuery().data ?? [];
  const teams = choices.filter((choice) => choice.kind === "team");
  const xAccounts = trpc.xDms.accounts.useQuery().data ?? [];
  const unreadCount = trpc.email.inbox.unreadCount.useQuery({ mailbox }).data ?? 0;
  return (
    <nav aria-label="Mail folders" className="flex w-60 shrink-0 flex-col gap-1 border-r p-3">
      {newEmailEnabled ? (
        <Tip label="Compose a new email">
          <Link
            href={mailbox === null ? "/inbox/compose" : `/inbox/compose?mailbox=${mailbox}`}
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
            href={`/inbox?folder=${key}${mailbox !== null && key !== "drafts" && key !== "outbox" ? `&mailbox=${mailbox}` : ""}`}
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
      {(teams.length > 0 || xAccounts.length > 0) && (
        <div className="mt-4 space-y-1">
          <p className="px-2.5 text-xs font-medium text-muted-foreground">Team</p>
          {teams.map((team) => (
            <Link
              key={team.id}
              href={`/inbox?mailbox=${team.id}`}
              aria-current={mailbox === team.id ? "page" : undefined}
              className={cn(
                "flex items-center rounded-md px-2.5 py-1.5 text-sm",
                mailbox === team.id && "bg-accent font-medium",
              )}
            >
              <span>{team.displayName}</span>
              {team.unread > 0 && (
                <span className="ml-auto rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                  {team.unread}
                </span>
              )}
            </Link>
          ))}
          <XAccountRailLinks accounts={xAccounts} activeId={activeXAccount(pathname)} />
          <Link href="/inbox" className="block px-2.5 py-1.5 text-sm">
            Personal inbox
          </Link>
        </div>
      )}
    </nav>
  );
}
