"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useRowSelection } from "@/components/data-table/useRowSelection";
import { ThreadRowsSkeleton } from "@/components/shell/skeletons";
import { EmptyState } from "@/components/ui/EmptyState";
import { STRINGS } from "@/constants/strings";
import { trpc } from "@/lib/trpc-client";
import type { ActionResult } from "@/types/actionResult";
import { readCsrfToken } from "@/utils/csrfCookie";
import type { InboxFilter, InboxThread } from "./emailReads";
import { archiveThreadAction, unarchiveThreadAction } from "./folderActions";
import { InboxZeroIllustration } from "./InboxZeroIllustration";
import { isInboxZero } from "./inboxZero";
import { markThreadReadAction, markThreadUnreadAction } from "./readActions";
import { ThreadListToolbar } from "./ThreadListToolbar";
import { type ThreadFolder, ThreadRow } from "./ThreadRow";
import { ThreadSelectionControls } from "./ThreadSelectionControls";
import { filterByAttributes, NO_ATTRIBUTE_FILTER } from "./threadAttributeFilter";
import { BULK_ACTION_ERROR, runBulk } from "./threadBulkActions";
import { useThreadFeed } from "./useThreadFeed";

interface ThreadListProps {
  mailbox?: string;
  folder: ThreadFolder;
  activeThreadId?: string;
  selectHref?: (threadId: string) => string;
  onSelect?: (threadId: string) => void;
  threads?: InboxThread[];
  threadsPending?: boolean;
  quickFilter?: InboxFilter;
  onQuickFilterChange?: (next: InboxFilter) => void;
  mailboxConnected?: boolean;
}

export function ThreadList({
  folder,
  mailbox,
  activeThreadId,
  selectHref = (id) =>
    `/inbox/${id}?folder=${folder}${mailbox === undefined ? "" : `&mailbox=${mailbox}`}`,
  onSelect,
  threads: providedThreads,
  threadsPending = false,
  quickFilter,
  onQuickFilterChange,
  mailboxConnected = false,
}: ThreadListProps): React.ReactNode {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [localFilter, setLocalFilter] = useState<InboxFilter>("all");
  const filter = quickFilter ?? localFilter;
  const setFilter = onQuickFilterChange ?? setLocalFilter;
  const [attrFilter, setAttrFilter] = useState(NO_ATTRIBUTE_FILTER);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const feed = useThreadFeed(folder, filter, mailbox);
  const sourceThreads = providedThreads ?? feed.threads;
  const threads =
    folder === "inbox" ? filterByAttributes(sourceThreads, attrFilter) : sourceThreads;
  const selection = useRowSelection();
  const pending = providedThreads !== undefined ? threadsPending : feed.pending;
  const showSkeleton = pending && threads.length === 0;
  const inboxZero = isInboxZero({
    folder,
    quickFilter: filter,
    attrFilter,
    searching: providedThreads !== undefined,
    mailboxConnected,
    pending,
    failed: providedThreads === undefined && feed.failed,
    threadCount: threads.length,
  });

  function afterArchive(): Promise<unknown> {
    return Promise.all([
      utils.email.inbox.list.invalidate(),
      utils.email.folders.archive.invalidate(),
    ]);
  }

  function afterReadChange(): void {
    void utils.email.inbox.unreadCount.invalidate();
  }

  function refreshFolder(): void {
    void utils.email.search.invalidate();
    if (folder === "sent") {
      void utils.email.folders.sent.invalidate();
      return;
    }
    if (folder === "archive") {
      void utils.email.folders.archive.invalidate();
      return;
    }
    void utils.email.inbox.list.invalidate();
    void utils.email.inbox.unreadCount.invalidate();
  }

  function afterVisibilityChange(): void {
    void utils.email.inbox.list.invalidate();
    void utils.email.folders.sent.invalidate();
    void utils.email.folders.archive.invalidate();
    void utils.email.search.invalidate();
  }

  async function applyBulk(
    action: (threadId: string) => Promise<ActionResult<{ threadId: string }>>,
    onSettled: () => void,
  ): Promise<void> {
    const ids = [...selection.selected];
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const failed = await runBulk(ids, action);
      selection.clear();
      for (const id of failed) selection.toggle(id);
      setBulkError(failed.length > 0 ? BULK_ACTION_ERROR : null);
      onSettled();
    } finally {
      setBulkBusy(false);
    }
  }

  function bulkArchive(): void {
    const op = folder === "archive" ? unarchiveThreadAction : archiveThreadAction;
    void applyBulk(
      (threadId) => op(readCsrfToken(), { threadId }),
      () => void afterArchive(),
    );
  }

  function bulkMarkRead(): void {
    void applyBulk(
      (threadId) => markThreadReadAction(readCsrfToken(), { threadId }),
      afterReadChange,
    );
  }

  function bulkMarkUnread(): void {
    void applyBulk(
      (threadId) => markThreadUnreadAction(readCsrfToken(), { threadId }),
      afterReadChange,
    );
  }

  const visibleIds = threads.map((t) => t.id);

  return (
    <div className="flex flex-col h-full">
      <ThreadListToolbar
        folder={folder}
        filter={filter}
        onFilterChange={setFilter}
        attrFilter={attrFilter}
        onAttrFilterChange={setAttrFilter}
        onRefresh={refreshFolder}
      />

      <ThreadSelectionControls
        folder={folder}
        selection={selection}
        visibleIds={visibleIds}
        showSkeleton={showSkeleton}
        count={threads.length}
        bulkBusy={bulkBusy}
        bulkArchive={bulkArchive}
        bulkMarkRead={bulkMarkRead}
        bulkMarkUnread={bulkMarkUnread}
      />

      {bulkError !== null && (
        <p role="alert" className="border-b px-3 py-1.5 text-xs text-destructive">
          {bulkError}
        </p>
      )}

      <ul className="flex-1 divide-y overflow-y-auto">
        {showSkeleton && <ThreadRowsSkeleton />}
        {inboxZero && (
          <li>
            <EmptyState
              illustration={<InboxZeroIllustration />}
              title={STRINGS.inbox.inboxZeroTitle}
              body={STRINGS.inbox.inboxZeroBody}
            />
          </li>
        )}
        {!inboxZero && !pending && threads.length === 0 && (
          <li className="p-4 text-sm text-muted-foreground">{STRINGS.inbox.noThreads}</li>
        )}
        {threads.map((thread) => (
          <ThreadRow
            key={thread.id}
            thread={thread}
            folder={folder}
            active={activeThreadId === thread.id}
            selected={selection.isSelected(thread.id)}
            onToggleSelected={selection.toggle}
            onOpen={(id) => (onSelect !== undefined ? onSelect(id) : router.push(selectHref(id)))}
            onArchiveDone={afterArchive}
            onVisibilityChanged={afterVisibilityChange}
          />
        ))}
        {feed.hasMore && (
          <li className="p-2">
            <button
              type="button"
              onClick={feed.loadMore}
              disabled={feed.loadingMore}
              className="w-full rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-[background-color,opacity,scale] duration-150 ease-out hover:bg-accent active:not-disabled:scale-[0.96] disabled:opacity-60 motion-reduce:transition-[background-color,opacity]"
            >
              {feed.loadingMore ? STRINGS.inbox.loadingMore : STRINGS.inbox.loadMore}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
