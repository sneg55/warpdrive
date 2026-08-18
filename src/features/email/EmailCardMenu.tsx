"use client";

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import type React from "react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STRINGS } from "@/constants/strings";

interface EmailCardMenuProps {
  threadId: string;
  // Actor owns this message's mailbox. Compose and unlink are owner-only server-side, so a
  // non-owner is never shown a control the backend would reject.
  canCompose: boolean;
  onReplyAll: () => void;
  onForward: () => void;
  onUnlink: () => void;
  // "Unlink from deal" or "Unlink from person", chosen by the surface.
  unlinkLabel: string;
}

// The caret menu on a timeline email card. Mailbox triage (archive, delete, mark unread,
// follow-up status, labels, privacy) lives only in the Inbox reader, which "Open in Inbox"
// reaches; a record surface offers the compose modes plus unlink.
export function EmailCardMenu({
  threadId,
  canCompose,
  onReplyAll,
  onForward,
  onUnlink,
  unlinkLabel,
}: EmailCardMenuProps): React.ReactNode {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={STRINGS.inbox.timelineMoreActions}
            className="rounded p-1 text-muted-foreground transition-transform hover:bg-accent active:scale-[0.96]"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canCompose && (
            <>
              <DropdownMenuItem onSelect={onReplyAll}>
                {STRINGS.inbox.replyAllAction}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onForward}>
                {STRINGS.inbox.forwardAction}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem asChild>
            <Link href={`/inbox/${threadId}`}>{STRINGS.inbox.openInInbox}</Link>
          </DropdownMenuItem>
          {canCompose && (
            <DropdownMenuItem onSelect={() => setConfirming(true)}>{unlinkLabel}</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={STRINGS.inbox.unlinkConfirmTitle}
        description={STRINGS.inbox.unlinkConfirmBody}
        confirmLabel={STRINGS.inbox.unlinkConfirmAction}
        destructive
        onConfirm={onUnlink}
      />
    </>
  );
}
