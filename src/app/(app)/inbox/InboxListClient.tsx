"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { STRINGS } from "@/constants/strings";
import { DraftsList } from "@/features/email/DraftsList";
import type { InboxFilter } from "@/features/email/emailReads";
import { InboxSearchBar } from "@/features/email/InboxSearchBar";
import type { FolderKey } from "@/features/email/inboxFolders";
import { OutboxList } from "@/features/email/OutboxList";
import { ThreadList } from "@/features/email/ThreadList";
import { useInboxRealtime } from "@/features/email/useInboxRealtime";
import { trpc } from "@/lib/trpc-client";

interface InboxListClientProps {
  selfActorId: string;
  folder: FolderKey;
}

export function InboxListClient({ selfActorId, folder }: InboxListClientProps): React.ReactNode {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  // The quick-filter lives here (not inside ThreadList) so it narrows the in-mail search too: search
  // results feed the same ThreadList as the inbox, so the active filter must apply to both (codex
  // review). ThreadList uses it for the inbox feed and the filter toolbar.
  const [quickFilter, setQuickFilter] = useState<InboxFilter>("all");
  const isSearching = searchQuery.trim() !== "";

  useInboxRealtime({ selfActorId });

  // In-mail search: while the box holds a non-empty query, results override whichever
  // folder tab is active (mirrors Gmail's "search overrides folder" behavior). Cleared
  // query falls back to the normal folder-driven ThreadList query. The active quick-filter narrows
  // the search server-side (searchInbox reuses the inbox predicate).
  const searchResults = trpc.email.search.useQuery(
    { q: searchQuery, filter: quickFilter },
    { enabled: isSearching },
  );

  const listPane =
    folder === "inbox" || folder === "sent" || folder === "archive" ? (
      <>
        <div className="shrink-0 border-b p-2">
          <InboxSearchBar onQuery={setSearchQuery} />
        </div>
        <div className="min-h-0 flex-1">
          <ThreadList
            folder={folder}
            quickFilter={quickFilter}
            onQuickFilterChange={setQuickFilter}
            threads={isSearching ? (searchResults.data ?? []) : undefined}
          />
        </div>
      </>
    ) : folder === "outbox" ? (
      <OutboxList />
    ) : (
      <DraftsList onResume={(d) => router.push(`/inbox/compose?draft=${d.id}`)} />
    );
  // The folder rail now lives in the persistent inbox layout (InboxShell), so the list route renders
  // only its conversation column here. Full-width conversation list (Pipedrive Sales Inbox parity):
  // no persistent reading pane; a row opens the thread on its own page inside the same shell.
  return (
    <main aria-label="Inbox" className="flex h-full min-h-0 flex-col">
      <h1 className="shrink-0 border-b px-4 py-2 text-lg font-semibold">{STRINGS.inbox.title}</h1>
      <section aria-label="Conversations" className="flex min-h-0 min-w-0 flex-1 flex-col">
        {listPane}
      </section>
    </main>
  );
}
