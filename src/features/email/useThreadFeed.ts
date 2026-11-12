"use client";

import { trpc } from "@/lib/trpc-client";
import type { InboxFilter, InboxThread } from "./emailReads";
import type { ThreadFolder } from "./ThreadRow";

export interface ThreadFeed {
  threads: InboxThread[];
  hasMore: boolean;
  loadMore: () => void;
  loadingMore: boolean;
  pending: boolean;
  failed: boolean;
}

export function useThreadFeed(
  folder: ThreadFolder,
  filter: InboxFilter,
  mailbox?: string,
): ThreadFeed {
  const sent = trpc.email.folders.sent.useInfiniteQuery(mailbox === undefined ? {} : { mailbox }, {
    enabled: folder === "sent",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const archive = trpc.email.folders.archive.useInfiniteQuery(
    mailbox === undefined ? {} : { mailbox },
    { enabled: folder === "archive", getNextPageParam: (last) => last.nextCursor ?? undefined },
  );
  const inbox = trpc.email.inbox.list.useInfiniteQuery(
    mailbox === undefined ? { filter } : { filter, mailbox },
    { enabled: folder === "inbox", getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  const q = folder === "sent" ? sent : folder === "archive" ? archive : inbox;
  return {
    threads: q.data?.pages.flatMap((p) => p.threads) ?? [],
    hasMore: q.hasNextPage,
    loadMore: () => void q.fetchNextPage(),
    loadingMore: q.isFetchingNextPage,
    pending: q.isPending,
    failed: q.isError,
  };
}
