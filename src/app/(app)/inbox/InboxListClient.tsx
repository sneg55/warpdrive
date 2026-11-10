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
  mailbox?: string;
  selfActorId: string;
  folder: FolderKey;
}

export function InboxListClient({
  selfActorId,
  folder,
  mailbox,
}: InboxListClientProps): React.ReactNode {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState<InboxFilter>("all");
  const isSearching = searchQuery.trim() !== "";

  useInboxRealtime({ selfActorId });

  const searchResults = trpc.email.search.useQuery(
    { q: searchQuery, filter: quickFilter, mailbox },
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
            mailbox={mailbox}
            quickFilter={quickFilter}
            onQuickFilterChange={setQuickFilter}
            threads={isSearching ? (searchResults.data ?? []) : undefined}
            threadsPending={
              isSearching && searchResults.data === undefined && searchResults.error === null
            }
          />
        </div>
      </>
    ) : folder === "outbox" ? (
      <OutboxList />
    ) : (
      <DraftsList onResume={(d) => router.push(`/inbox/compose?draft=${d.id}`)} />
    );
  return (
    <main aria-label="Inbox" className="flex h-full min-h-0 flex-col">
      <h1 className="shrink-0 border-b px-4 py-2 text-lg font-semibold">{STRINGS.inbox.title}</h1>
      <section aria-label="Conversations" className="flex min-h-0 min-w-0 flex-1 flex-col">
        {listPane}
      </section>
    </main>
  );
}
