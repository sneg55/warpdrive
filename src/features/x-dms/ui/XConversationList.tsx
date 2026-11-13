"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { trpc } from "@/lib/trpc-client";
import { cn } from "@/lib/utils";
import type { XListView } from "../reads";
import { X_DM_STRINGS } from "../strings";
import { XConversationRow } from "./XConversationRow";
import { xListHref } from "./xRoutes";

const VIEWS: { view: XListView; label: string }[] = [
  { view: "inbox", label: X_DM_STRINGS.inbox },
  { view: "archived", label: X_DM_STRINGS.archive },
];

function ViewTabs({ accountId, view }: { accountId: string; view: XListView }): React.ReactNode {
  return (
    <nav aria-label={X_DM_STRINGS.inbox} className="flex items-center gap-1">
      {VIEWS.map((v) => (
        <Link
          key={v.view}
          href={xListHref(accountId, v.view)}
          aria-current={view === v.view ? "page" : undefined}
          className={cn(
            "rounded-md px-2.5 py-1.5 text-sm",
            view === v.view
              ? "bg-accent font-medium text-accent-foreground"
              : "text-foreground hover:bg-accent",
          )}
        >
          {v.label}
        </Link>
      ))}
    </nav>
  );
}

export function XConversationList({
  accountId,
  accountName,
  view,
}: {
  accountId: string;
  accountName: string;
  view: XListView;
}): React.ReactNode {
  const q = trpc.xDms.list.useInfiniteQuery(
    { accountId, view },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );
  const rows = q.data?.pages.flatMap((p) => p.rows) ?? [];
  const empty = view === "archived" ? X_DM_STRINGS.emptyArchived : X_DM_STRINGS.emptyInbox;

  return (
    <main aria-label={accountName} className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-4 border-b px-4 py-2">
        <h1 className="text-lg font-semibold">{accountName}</h1>
        <ViewTabs accountId={accountId} view={view} />
      </header>
      <section className="min-h-0 flex-1 overflow-y-auto">
        {q.isPending ? (
          <p className="p-4 text-sm text-muted-foreground">{X_DM_STRINGS.loading}</p>
        ) : q.isError ? (
          <p role="alert" className="p-4 text-sm text-destructive">
            {X_DM_STRINGS.loadFailed} {X_DM_STRINGS.errorId(q.error.message)}
          </p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <XConversationRow key={row.id} accountId={accountId} view={view} conversation={row} />
            ))}
          </ul>
        )}
        {q.hasNextPage && (
          <div className="flex justify-center p-3">
            <Button
              variant="outline"
              size="sm"
              disabled={q.isFetchingNextPage}
              onClick={() => void q.fetchNextPage()}
            >
              {q.isFetchingNextPage ? X_DM_STRINGS.loadingMore : X_DM_STRINGS.loadMore}
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
