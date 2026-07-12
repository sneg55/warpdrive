"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BulkActionBar } from "@/components/data-table/BulkActionBar";
import { useRowSelection } from "@/components/data-table/useRowSelection";
import { Checkbox } from "@/components/ui/Checkbox";
import type { AppError } from "@/constants/errorIds";
import { STRINGS } from "@/constants/strings";
import { trpc } from "@/lib/trpc-client";
import type { Result } from "@/types/result";
import { readCsrfToken } from "@/utils/csrfCookie";
import type { InboxFilter, InboxThread } from "./emailReads";
import { archiveThreadAction, unarchiveThreadAction } from "./folderActions";
import { markThreadReadAction, markThreadUnreadAction } from "./readActions";
import { ThreadListToolbar } from "./ThreadListToolbar";
import { canArchiveInFolder, canSelectInFolder, type ThreadFolder, ThreadRow } from "./ThreadRow";
import { filterByAttributes, NO_ATTRIBUTE_FILTER } from "./threadAttributeFilter";
import { BULK_ACTION_ERROR, runBulk } from "./threadBulkActions";

interface ThreadListProps {
  // Which backed read feeds the list: Inbox (email.inbox.list), Sent, Archive, or "linked"
  // (caller supplies `threads`; no internal query).
  folder: ThreadFolder;
  activeThreadId?: string;
  // Where selecting a thread navigates. Defaults to the standalone thread route;
  // the two-pane inbox passes a `?thread=` href so the reader stays alongside.
  selectHref?: (threadId: string) => string;
  // When provided, selecting a thread calls this instead of navigating (used by the deal Email tab
  // to read a thread inline, A2, rather than leaving the deal for /inbox).
  onSelect?: (threadId: string) => void;
  // When provided, render exactly these threads instead of fetching (used by "linked" views).
  threads?: InboxThread[];
  // The active quick-filter (all/unmatched/needs_linking + the U5 quick-filters). Lifted to the
  // caller (InboxListClient) so an active in-mail search can narrow by the SAME filter (codex
  // review); it feeds both the inbox feed and the filter toolbar. Optional: callers that only render
  // "linked" views leave it uncontrolled and ThreadList keeps its own local state.
  quickFilter?: InboxFilter;
  onQuickFilterChange?: (next: InboxFilter) => void;
}

interface ThreadFeed {
  threads: InboxThread[];
  hasMore: boolean;
  loadMore: () => void;
  loadingMore: boolean;
}

// All three backed folders page. "linked" supplies its threads directly and never gets here.
// A null nextCursor means the folder is exhausted; undefined tells TanStack to stop.
function useThreads(folder: ThreadFolder, filter: InboxFilter): ThreadFeed {
  const sent = trpc.email.folders.sent.useInfiniteQuery(
    {},
    { enabled: folder === "sent", getNextPageParam: (last) => last.nextCursor ?? undefined },
  );
  const archive = trpc.email.folders.archive.useInfiniteQuery(
    {},
    { enabled: folder === "archive", getNextPageParam: (last) => last.nextCursor ?? undefined },
  );
  const inbox = trpc.email.inbox.list.useInfiniteQuery(
    { filter },
    { enabled: folder === "inbox", getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  const q = folder === "sent" ? sent : folder === "archive" ? archive : inbox;
  return {
    threads: q.data?.pages.flatMap((p) => p.threads) ?? [],
    hasMore: q.hasNextPage,
    loadMore: () => void q.fetchNextPage(),
    loadingMore: q.isFetchingNextPage,
  };
}

export function ThreadList({
  folder,
  activeThreadId,
  // Carry the folder into the reader URL so its prev/next nav walks the same folder (P3). "linked"
  // views use onSelect (inline), never this href, so the folder is always a navigable one here.
  selectHref = (id) => `/inbox/${id}?folder=${folder}`,
  onSelect,
  threads: providedThreads,
  quickFilter,
  onQuickFilterChange,
}: ThreadListProps): React.ReactNode {
  const router = useRouter();
  const utils = trpc.useUtils();
  // Controlled when the caller lifts the quick-filter (InboxListClient), uncontrolled otherwise.
  const [localFilter, setLocalFilter] = useState<InboxFilter>("all");
  const filter = quickFilter ?? localFilter;
  const setFilter = onQuickFilterChange ?? setLocalFilter;
  const [attrFilter, setAttrFilter] = useState(NO_ATTRIBUTE_FILTER);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const feed = useThreads(folder, filter);
  // Follow-up-status + label + quick-filters (IB1, P2) narrow the rendered list client-side over
  // the attributes each thread already carries. They apply ONLY on the inbox: that is the only
  // folder that shows the filter row and whose feed projects hasAttachment/unread. Applying a
  // retained filter to Sent/Archive (whose rows default those fields to false) would wrongly hide
  // every row after a folder switch (codex review).
  const sourceThreads = providedThreads ?? feed.threads;
  const threads =
    folder === "inbox" ? filterByAttributes(sourceThreads, attrFilter) : sourceThreads;
  const selection = useRowSelection();

  function afterArchive(): void {
    void utils.email.inbox.list.invalidate();
    void utils.email.folders.archive.invalidate();
  }

  function afterReadChange(): void {
    void utils.email.inbox.unreadCount.invalidate();
  }

  // Manual Refresh (A1, Pipedrive parity): re-pull the current folder's feed without a full
  // navigation. Realtime already nudges these, but a user-driven refetch matches PD and covers the
  // gap between poll cycles. Folder-aware so Sent/Archive refetch their own read (D2), not the inbox.
  function refreshFolder(): void {
    // In-mail search overrides whichever folder tab is active (InboxListClient feeds email.search
    // results to this list), so refresh must invalidate search regardless of the folder or the
    // displayed results never update (codex P2). A no-op when no search query is mounted.
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

  // Owner flipped a thread's visibility: refresh whichever feed is showing so the lock and the
  // projected visibility reflect the write (and a now-private thread stops appearing to others).
  // Search is included because the list can be rendering email.search results (providedThreads),
  // whose cache would otherwise keep the stale lock until the query re-runs (codex review).
  function afterVisibilityChange(): void {
    void utils.email.inbox.list.invalidate();
    void utils.email.folders.sent.invalidate();
    void utils.email.folders.archive.invalidate();
    void utils.email.search.invalidate();
  }

  async function applyBulk(
    action: (threadId: string) => Promise<Result<{ threadId: string }, AppError>>,
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
    void applyBulk((threadId) => op(readCsrfToken(), { threadId }), afterArchive);
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

      <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          {canSelectInFolder(folder) && (
            <Checkbox
              label="Select all threads"
              checked={selection.allSelected(visibleIds)}
              onCheckedChange={() => selection.toggleAll(visibleIds)}
            />
          )}
          <span className="tabular-nums">
            {threads.length} {threads.length === 1 ? "conversation" : "conversations"}
          </span>
        </div>
      </div>

      {canSelectInFolder(folder) && selection.count > 0 && (
        <div className="border-b px-3 py-2">
          <BulkActionBar count={selection.count} onClear={selection.clear}>
            <div role="toolbar" aria-label="Bulk actions" className="flex flex-wrap gap-2">
              {canArchiveInFolder(folder) && (
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={bulkArchive}
                  className="rounded-md border px-3 py-1 text-sm transition-transform hover:bg-accent active:scale-[0.96] disabled:opacity-50"
                >
                  {folder === "archive" ? "Unarchive" : "Archive"}
                </button>
              )}
              <button
                type="button"
                disabled={bulkBusy}
                onClick={bulkMarkRead}
                className="rounded-md border px-3 py-1 text-sm transition-transform hover:bg-accent active:scale-[0.96] disabled:opacity-50"
              >
                Mark read
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={bulkMarkUnread}
                className="rounded-md border px-3 py-1 text-sm transition-transform hover:bg-accent active:scale-[0.96] disabled:opacity-50"
              >
                Mark unread
              </button>
            </div>
          </BulkActionBar>
        </div>
      )}

      {bulkError !== null && (
        <p role="alert" className="border-b px-3 py-1.5 text-xs text-destructive">
          {bulkError}
        </p>
      )}

      <ul className="flex-1 divide-y overflow-y-auto">
        {threads.length === 0 && (
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
          // Paging is per-page, not per-mailbox: the select-all checkbox above covers the rows
          // currently loaded, matching the People and Orgs lists.
          <li className="p-2">
            <button
              type="button"
              onClick={feed.loadMore}
              disabled={feed.loadingMore}
              className="w-full rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-accent disabled:opacity-60"
            >
              {feed.loadingMore ? STRINGS.inbox.loadingMore : STRINGS.inbox.loadMore}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
