"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { STRINGS } from "@/constants/strings";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import { trashThreadAction } from "./actions";
import { archiveThreadAction } from "./folderActions";
import type { NeighborFolder } from "./threadNeighbors";

// The list appends ?folder= when opening a thread; default to inbox and ignore anything else so a
// stray value never reaches the neighbors query (its input is the same three-value enum).
function readFolder(raw: string | null): NeighborFolder {
  return raw === "sent" || raw === "archive" ? raw : "inbox";
}

// Reader navigation bar (Pipedrive parity D1): a Back link, previous/next thread navigation with an
// N / total position (P3), and an Archive action. The full-page reader otherwise stranded the user
// on browser-back / the nav rail. Archive mirrors the list's per-row action, then returns to the
// inbox; a denied archive surfaces the error id instead of silently no-opping (F5-7).
// canManage: the actor owns the mailbox (canCompose). Archive and Delete are owner-only mutations,
// so a non-owner viewing a shared thread is not offered controls the backend would reject (F5-7).
export function ReaderTopBar({
  threadId,
  canManage,
}: {
  threadId: string;
  canManage: boolean;
}): React.ReactNode {
  const router = useRouter();
  const reportError = useActionError();
  const utils = trpc.useUtils();
  const folder = readFolder(useSearchParams().get("folder"));
  const { data: neighbors } = trpc.email.thread.neighbors.useQuery({ threadId, folder });
  const [busy, setBusy] = useState(false);

  // Archive/Delete both remove the thread from its list, then navigate to /inbox. The list feeds and
  // counts are cached (30s staleTime), so invalidate them or the just-removed row remounts stale.
  function invalidateFeeds(): void {
    void utils.email.inbox.list.invalidate();
    void utils.email.inbox.unreadCount.invalidate();
    void utils.email.folders.sent.invalidate();
    void utils.email.folders.archive.invalidate();
    void utils.email.search.invalidate();
    // The deal/contact Email tabs read linked threads separately; refresh them too so a Back to the
    // entity tab does not render the just-trashed row from cache.
    void utils.email.forDeal.invalidate();
    void utils.email.forContact.invalidate();
  }

  async function archive(): Promise<void> {
    setBusy(true);
    const res = await archiveThreadAction(readCsrfToken(), { threadId });
    setBusy(false);
    if (res.ok) {
      invalidateFeeds();
      router.push("/inbox");
    } else reportError(res.error.id);
  }

  async function del(): Promise<void> {
    setBusy(true);
    const res = await trashThreadAction(readCsrfToken(), { threadId });
    setBusy(false);
    // A trashed thread leaves every folder, so return to the inbox on success; a denied/failed
    // trash surfaces the error id instead of silently no-opping (feedback-surface-mutation-failures).
    if (res.ok) {
      invalidateFeeds();
      // Drop the reader's cached thread so a Back navigation re-fetches (getThread now 404s on a
      // trashed thread) instead of re-rendering the deleted conversation from a 30s-stale cache; and
      // REPLACE rather than push so the deleted reader route is not left in history at all.
      void utils.email.thread.get.invalidate();
      router.replace("/inbox");
    } else reportError(res.error.id);
  }

  function goTo(id: string | null): void {
    if (id === null) return;
    router.push(`/inbox/${id}?folder=${folder}`);
  }

  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-2">
      <Link
        href="/inbox"
        aria-label={STRINGS.inbox.backToInbox}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-transform hover:bg-accent active:scale-[0.96]"
      >
        <Chevron dir="left" />
        {STRINGS.inbox.back}
      </Link>

      {/* Prev/next + position only for the mailbox owner: neighbors is null for a shared-thread
          viewer (no owner-scoped folder to walk). */}
      {neighbors != null && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={STRINGS.inbox.previousConversation}
            disabled={neighbors.prevId === null}
            onClick={() => goTo(neighbors.prevId)}
            className="rounded-md p-1 text-muted-foreground transition-transform hover:bg-accent active:scale-[0.96] disabled:opacity-40"
          >
            <Chevron dir="left" />
          </button>
          <span className="tabular-nums text-xs text-muted-foreground">
            {neighbors.index} / {neighbors.total}
          </span>
          <button
            type="button"
            aria-label={STRINGS.inbox.nextConversation}
            disabled={neighbors.nextId === null}
            onClick={() => goTo(neighbors.nextId)}
            className="rounded-md p-1 text-muted-foreground transition-transform hover:bg-accent active:scale-[0.96] disabled:opacity-40"
          >
            <Chevron dir="right" />
          </button>
        </div>
      )}

      {/* B3: PD groups the reader actions top-left, adjacent to Back + pager, rather than pushing
          Archive/Delete to the far right. Archive + Delete share one action group. */}
      {canManage && (
        <div data-reader-actions-group className="flex items-center gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => void archive()}
            className="rounded-md border border-border px-3 py-1 text-sm transition-transform hover:bg-accent active:scale-[0.96] disabled:opacity-50"
          >
            {STRINGS.inbox.archive}
          </button>

          <AlertDialog>
            <AlertDialogTrigger
              disabled={busy}
              className="rounded-md border border-border px-3 py-1 text-sm text-destructive transition-transform hover:bg-destructive/10 active:scale-[0.96] disabled:opacity-50"
            >
              {STRINGS.inbox.delete}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{STRINGS.inbox.deleteConfirmTitle}</AlertDialogTitle>
                <AlertDialogDescription>{STRINGS.inbox.deleteConfirmBody}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-md border border-border px-3 py-1.5 text-sm transition-transform hover:bg-accent active:scale-[0.96]">
                  {STRINGS.inbox.deleteCancel}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void del()}
                  className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground transition-transform hover:bg-destructive/90 active:scale-[0.96]"
                >
                  {STRINGS.inbox.deleteConfirmAction}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }): React.ReactNode {
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
      <path d={dir === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}
