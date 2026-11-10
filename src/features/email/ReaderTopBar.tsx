"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
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
import { invalidateRecordTimelines } from "./invalidateRecordTimelines";
import type { NeighborFolder } from "./threadNeighbors";

function readFolder(raw: string | null): NeighborFolder {
  return raw === "sent" || raw === "archive" ? raw : "inbox";
}

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
  const params = useSearchParams();
  const folder = readFolder(params.get("folder"));
  const mailbox = params.get("mailbox");
  const inboxHref = mailbox === null ? "/inbox" : `/inbox?mailbox=${encodeURIComponent(mailbox)}`;
  const mailboxSuffix = mailbox === null ? "" : `&mailbox=${encodeURIComponent(mailbox)}`;
  const { data: neighbors } = trpc.email.thread.neighbors.useQuery({ threadId, folder });
  const [busy, setBusy] = useState(false);

  function invalidateFeeds(): void {
    void utils.email.inbox.list.invalidate();
    void utils.email.inbox.unreadCount.invalidate();
    void utils.email.folders.sent.invalidate();
    void utils.email.folders.archive.invalidate();
    void utils.email.search.invalidate();
    invalidateRecordTimelines(utils);
  }

  async function archive(): Promise<void> {
    setBusy(true);
    const res = await archiveThreadAction(readCsrfToken(), { threadId });
    setBusy(false);
    if (res.ok) {
      invalidateFeeds();
      router.push(inboxHref);
    } else reportError(res.error.id);
  }

  async function del(): Promise<void> {
    setBusy(true);
    const res = await trashThreadAction(readCsrfToken(), { threadId });
    setBusy(false);
    if (res.ok) {
      invalidateFeeds();
      void utils.email.thread.get.invalidate();
      router.replace(inboxHref);
    } else reportError(res.error.id);
  }

  function goTo(id: string | null): void {
    if (id === null) return;
    router.push(`/inbox/${id}?folder=${folder}${mailboxSuffix}`);
  }

  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-2">
      <Link
        href={inboxHref}
        aria-label={STRINGS.inbox.backToInbox}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-transform hover:bg-accent active:scale-[0.96]"
      >
        <Chevron dir="left" />
        {STRINGS.inbox.back}
      </Link>
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
  const Glyph = dir === "left" ? ChevronLeft : ChevronRight;
  return <Glyph aria-hidden="true" className="h-4 w-4" />;
}
