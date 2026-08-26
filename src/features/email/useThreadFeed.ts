"use client";

import { trpc } from "@/lib/trpc-client";
import type { InboxFilter, InboxThread } from "./emailReads";
import type { ThreadFolder } from "./ThreadRow";

export interface ThreadFeed {
  threads: InboxThread[];
  hasMore: boolean;
  loadMore: () => void;
  loadingMore: boolean;
  // True until the folder's first page has resolved. The list must not paint a count or a
  // "no threads" message before then.
  pending: boolean;
}

// All three backed folders page. "linked" supplies its threads directly and never gets here.
// A null nextCursor means the folder is exhausted; undefined tells TanStack to stop.
export function useThreadFeed(folder: ThreadFolder, filter: InboxFilter): ThreadFeed {
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
    pending: q.isPending,
  };
}
