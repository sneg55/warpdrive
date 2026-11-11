"use client";

import { ChevronDown, LoaderCircle, Paperclip } from "lucide-react";
import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { Checkbox } from "@/components/ui/Checkbox";
import { ROW_ACTION_BUTTON } from "@/constants/formStyles";
import { STRINGS } from "@/constants/strings";
import { MASK_CLASS } from "@/features/observability/replayMasking";
import { cn } from "@/lib/utils";
import { readCsrfToken } from "@/utils/csrfCookie";
import type { InboxThread } from "./emailReads";
import { archiveThreadAction, unarchiveThreadAction } from "./folderActions";
import { formatInboxListDate } from "./inboxDate";
import { decodeEmailSnippet } from "./snippetText";
import { TeamReplyChip } from "./TeamReplyChip";
import { ThreadLabelChips } from "./ThreadLabelChips";
import { ThreadPrivacyToggle } from "./ThreadPrivacyToggle";

export type ThreadFolder = "inbox" | "sent" | "archive" | "linked";

export function canArchiveInFolder(folder: ThreadFolder): boolean {
  return folder !== "sent" && folder !== "linked";
}

export function canSelectInFolder(folder: ThreadFolder): boolean {
  return folder !== "linked";
}

function RowArchiveButton({
  folder,
  threadId,
  busy,
  setBusy,
  onDone,
}: {
  folder: ThreadFolder;
  threadId: string;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onDone: () => Promise<unknown>;
}): React.ReactNode {
  const reportError = useActionError();
  if (!canArchiveInFolder(folder)) return null;
  const isArchive = folder === "archive";
  const idleLabel = isArchive ? "Unarchive" : "Archive";
  const busyLabel = isArchive ? "Unarchiving" : "Archiving";

  async function run(): Promise<void> {
    setBusy(true);
    try {
      const action = isArchive ? unarchiveThreadAction : archiveThreadAction;
      const res = await action(readCsrfToken(), { threadId });
      if (res.ok) await onDone();
      else reportError(res.error.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      aria-busy={busy}
      aria-label={busy ? busyLabel : idleLabel}
      onClick={() => void run()}
      className={`${ROW_ACTION_BUTTON} inline-flex items-center gap-1 self-start`}
    >
      {busy && (
        <LoaderCircle aria-hidden="true" className="h-3 w-3 animate-spin motion-reduce:hidden" />
      )}
      {busy ? `${busyLabel}…` : idleLabel}
    </button>
  );
}

interface ThreadRowProps {
  thread: InboxThread;
  folder: ThreadFolder;
  active: boolean;
  selected: boolean;
  onToggleSelected: (threadId: string) => void;
  onOpen: (threadId: string) => void;
  onArchiveDone: () => Promise<unknown>;
  onVisibilityChanged?: () => void;
}

export function ThreadRow({
  thread,
  folder,
  active,
  selected,
  onToggleSelected,
  onOpen,
  onArchiveDone,
  onVisibilityChanged,
}: ThreadRowProps): React.ReactNode {
  const subject = thread.subject ?? "(no subject)";
  const weight = thread.unread ? "font-semibold" : "font-normal";
  const [archiving, setArchiving] = useState(false);
  return (
    <li
      aria-busy={archiving || undefined}
      className={cn(
        "group flex items-center gap-2 pr-2 transition-opacity [content-visibility:auto] [contain-intrinsic-size:auto_52px]",
        active ? "bg-accent" : "hover:bg-muted/50",
        archiving && "opacity-60",
      )}
    >
      {canSelectInFolder(folder) && (
        <div className="flex items-center px-2 py-2.5">
          <Checkbox
            label={`Select ${subject}`}
            checked={selected}
            onCheckedChange={() => onToggleSelected(thread.id)}
          />
        </div>
      )}
      <button
        type="button"
        className={`flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left ${canSelectInFolder(folder) ? "" : "pl-3"}`}
        onClick={() => onOpen(thread.id)}
      >
        {thread.senderEmail !== null && (
          <span className={`max-w-56 shrink-0 truncate text-sm text-foreground ${weight}`}>
            {thread.unread && (
              <span
                aria-hidden="true"
                className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle"
              />
            )}

            {thread.senderName ?? thread.senderEmail}
          </span>
        )}

        <ThreadLabelChips labels={thread.labels} />

        <span className="min-w-0 flex-1 truncate text-sm">
          {thread.senderEmail === null && thread.unread && (
            <span
              aria-hidden="true"
              className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle"
            />
          )}
          <span className={`text-foreground ${weight}`}>{subject}</span>
          {thread.snippet !== null && thread.snippet !== "" && (
            <span className={cn("text-muted-foreground", MASK_CLASS)}>
              {" "}
              {decodeEmailSnippet(thread.snippet)}
            </span>
          )}
        </span>
        <TeamReplyChip status={thread.replyStatus} />
        {thread.personId === null && thread.dealId === null && (
          <span className="shrink-0 rounded bg-warning/20 px-1.5 py-0.5 text-xs text-warning-foreground">
            Unlinked
          </span>
        )}
      </button>
      {thread.hasAttachment && (
        <Paperclip
          role="img"
          aria-label={STRINGS.inbox.hasAttachmentLabel}
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
        />
      )}

      {thread.isOwner && (
        <div className="flex shrink-0 items-center text-muted-foreground">
          <ThreadPrivacyToggle
            threadId={thread.id}
            visibility={thread.visibility}
            onChanged={onVisibilityChanged}
          />
          <ChevronDown data-privacy-caret="true" aria-hidden="true" className="-ml-1 h-3 w-3" />
        </div>
      )}
      <div
        className={cn(
          "shrink-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100",
          archiving ? "opacity-100" : "opacity-0",
        )}
      >
        <RowArchiveButton
          folder={folder}
          threadId={thread.id}
          busy={archiving}
          setBusy={setArchiving}
          onDone={onArchiveDone}
        />
      </div>

      <span className="w-16 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
        {formatInboxListDate(thread.lastMessageAt)}
      </span>
    </li>
  );
}
