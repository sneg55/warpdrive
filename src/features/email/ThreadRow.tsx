"use client";

import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { Checkbox } from "@/components/ui/Checkbox";
import { ROW_ACTION_BUTTON } from "@/constants/formStyles";
import { STRINGS } from "@/constants/strings";
import { readCsrfToken } from "@/utils/csrfCookie";
import type { InboxThread } from "./emailReads";
import { archiveThreadAction, unarchiveThreadAction } from "./folderActions";
import { formatInboxListDate } from "./inboxDate";
import { ThreadLabelChips } from "./ThreadLabelChips";
import { ThreadPrivacyToggle } from "./ThreadPrivacyToggle";

// "linked" is a chrome-less view (no folder query, filter chips, or archive affordance):
// the caller passes an already-fetched `threads` list, e.g. the deal/contact Email tab.
export type ThreadFolder = "inbox" | "sent" | "archive" | "linked";

// Sent threads only ever go one direction (already sent, nothing to archive back from) and
// "linked" has no chrome at all. Shared by the per-row button and the bulk action bar so
// both gates read from the same source instead of drifting apart.
export function canArchiveInFolder(folder: ThreadFolder): boolean {
  return folder !== "sent" && folder !== "linked";
}

// "linked" is the only chrome-less view: no checkbox column, header select-all, or bulk
// action bar. "sent" still supports selection (for bulk mark-read/unread) even though it
// can't archive, see canArchiveInFolder.
export function canSelectInFolder(folder: ThreadFolder): boolean {
  return folder !== "linked";
}

// Per-row archive/unarchive affordance. Inbox rows archive; Archive rows unarchive; Sent
// rows get no affordance. A real <button> (mutation), separate from the nav <button>.
function RowArchiveButton({
  folder,
  threadId,
  onDone,
}: {
  folder: ThreadFolder;
  threadId: string;
  onDone: () => void;
}): React.ReactNode {
  const [busy, setBusy] = useState(false);
  const reportError = useActionError();
  if (!canArchiveInFolder(folder)) return null;
  const isArchive = folder === "archive";

  async function run(): Promise<void> {
    setBusy(true);
    const action = isArchive ? unarchiveThreadAction : archiveThreadAction;
    const res = await action(readCsrfToken(), { threadId });
    setBusy(false);
    if (res.ok) onDone();
    else reportError(res.error.id);
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void run()}
      className={`${ROW_ACTION_BUTTON} self-start`}
    >
      {isArchive ? "Unarchive" : "Archive"}
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
  onArchiveDone: () => void;
  // Refresh the list after the owner flips this thread's visibility, so the lock and the projected
  // visibility stay in sync with the DB. Optional: chrome-less callers omit it.
  onVisibilityChanged?: () => void;
}

// A single thread row: select checkbox, the nav button that opens the thread, and the
// per-row archive/unarchive affordance. The checkbox stops click propagation so toggling
// selection never also fires the row's onOpen navigation.
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
  // Pipedrive-style single-line row: sender column, then subject + inline snippet, then the date
  // on the right (archive appears on hover). No persistent reading pane; the row opens the thread.
  return (
    <li
      className={`group flex items-center gap-2 pr-2 [content-visibility:auto] [contain-intrinsic-size:auto_52px] ${active ? "bg-accent" : "hover:bg-muted/50"}`}
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
        {/* Correspondent column (Pipedrive leads each row with the counterparty). Projected by the
            Inbox AND the Sent/Archive folder reads (folderReads.ts); rendered whenever a
            correspondent address is present, blank only when a thread genuinely has no other party. */}
        {thread.senderEmail !== null && (
          <span className={`max-w-56 shrink-0 truncate text-sm text-foreground ${weight}`}>
            {thread.unread && (
              <span
                aria-hidden="true"
                className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle"
              />
            )}
            {/* Pipedrive leads with the sender's display name; fall back to the address when the
                From header carried no name (or older mail synced before from_name existed). */}
            {thread.senderName ?? thread.senderEmail}
          </span>
        )}
        {/* A15: the label chip leads the subject (Pipedrive positions it before, not after). */}
        <ThreadLabelChips labels={thread.labels} />
        {/* Subject + inline snippet preview, subject bolded when unread. */}
        <span className="min-w-0 flex-1 truncate text-sm">
          {thread.senderEmail === null && thread.unread && (
            <span
              aria-hidden="true"
              className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle"
            />
          )}
          <span className={`text-foreground ${weight}`}>{subject}</span>
          {thread.snippet !== null && thread.snippet !== "" && (
            <span className="text-muted-foreground"> {thread.snippet}</span>
          )}
        </span>
        {thread.personId === null && thread.dealId === null && (
          <span className="shrink-0 rounded bg-warning/20 px-1.5 py-0.5 text-xs text-warning-foreground">
            Unlinked
          </span>
        )}
      </button>
      {thread.hasAttachment && (
        <svg
          role="img"
          aria-label={STRINGS.inbox.hasAttachmentLabel}
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21.44 11.05 12.25 20.24a5 5 0 0 1-7.07-7.07l8.49-8.49a3 3 0 0 1 4.24 4.24l-8.49 8.49a1 1 0 0 1-1.41-1.41l7.78-7.78" />
        </svg>
      )}
      {/* Privacy toggle stays visible (the lock reflects private/shared at a glance); owner-only.
          A16: a caret sits next to the lock so the affordance reads as a dropdown (the lock is the
          real DropdownMenu trigger; the caret is decorative). */}
      {thread.isOwner && (
        <div className="flex shrink-0 items-center text-muted-foreground">
          <ThreadPrivacyToggle
            threadId={thread.id}
            visibility={thread.visibility}
            onChanged={onVisibilityChanged}
          />
          <svg
            data-privacy-caret="true"
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="-ml-1 h-3 w-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      )}
      <div className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <RowArchiveButton folder={folder} threadId={thread.id} onDone={onArchiveDone} />
      </div>
      {/* A14: row date at the larger 14px font (text-sm) to match Pipedrive's list. */}
      <span className="w-16 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
        {formatInboxListDate(thread.lastMessageAt)}
      </span>
    </li>
  );
}
